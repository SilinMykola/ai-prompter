import type { ClientMessage, HintMode, ServerMessage, TargetLanguage } from '@ai-prompter/shared/protocol';
import type { Registry } from './llm';
import type { LlmProvider } from './llm/types';
import { createSentenceAssembler, type AssemblerOutput } from './sentences';
import type { SttProvider, SttStream } from './stt/types';
import { streamHint, type HintOptions } from './hint';
import { HINT_CONTEXT_SENTENCES } from './prompts';
import type { DevLog, DevLogFactory } from './devLog';
import { createParagrapher } from './paragraphs';
import { isAlreadyIn } from './languageDetect';
import { translateSentence, type TranslateOptions } from './translate';
import { validateStart } from './validateStart';

// One call session: lives as long as one browser WebSocket connection.
//
// This module knows nothing about sockets. It is given a `send` function (to the browser),
// a `close` function (hang up) and the services it needs, and it exposes three entry points
// (`onText`, `onBinary`, `onClose`) that the WebSocket layer calls. That keeps it easy to test.
//
// Privacy: everything about the call is kept in local variables only, and the log receives
// event names, never recognised text, context or profile.

export interface SessionDeps {
  send(message: ServerMessage): void;
  /** Closes the WebSocket connection to the browser. */
  close(): void;
  stt: SttProvider;
  registry: Pick<Registry, 'get' | 'modelsOf'>;
  log?(event: string): void;
  /** Opens the developer log of this call, when the user asked for one. */
  openDevLog?: DevLogFactory;
  /** How long to wait for the first message. */
  startTimeoutMs?: number;
  /** Translates one sentence. Replaceable in tests. */
  translate?: (options: TranslateOptions) => Promise<void>;
  /** Produces one reply hint. Replaceable in tests. */
  hint?: (options: HintOptions) => Promise<void>;
}

export interface Session {
  /** A text frame from the browser (should be JSON). */
  onText(raw: string): Promise<void>;
  /** A binary frame from the browser: a chunk of audio. */
  onBinary(chunk: Uint8Array): void;
  /** The connection to the browser closed. */
  onClose(): void;
}

// waiting: no message yet | starting: `start` is being checked | running: audio flows
// ending: `stop` received, last words still arriving | done: nothing happens any more
type State = 'waiting' | 'starting' | 'running' | 'ending' | 'done';

const DEFAULT_START_TIMEOUT_MS = 10_000;

// On "stop", translations that are still running get this long to finish.
const STOP_GRACE_MS = 5000;

export function createSession(deps: SessionDeps): Session {
  const baseLog = deps.log ?? (() => {});
  // Developer mode (opt-in per call): a full record of the call in a file. Off unless `start` asks.
  let dev: DevLog | undefined;
  const log = (event: string) => {
    baseLog(event);
    dev?.write('event', event);
  };
  let state: State = 'waiting';
  let stream: SttStream | undefined;
  const assembler = createSentenceAssembler();
  const paragrapher = createParagrapher();
  const translate = deps.translate ?? translateSentence;
  const hint = deps.hint ?? streamHint;

  // What translation needs, known after a valid `start`.
  let llm: LlmProvider | undefined;
  let translationModel = '';
  let targetLanguage: TargetLanguage = 'ru';
  let callContext = '';
  let profile = ''; // the user's own data: used for hints only, never for translation
  let hintModel = '';
  // The sentences said so far (index = id - 1): context for the next translations, and for "retranslate".
  const history: string[] = [];
  const running = new Set<Promise<void>>(); // translations in progress
  const controllers = new Map<number, AbortController>(); // the newest translation of each sentence
  const cancelTranslations = new AbortController(); // aborted when the session ends
  const cancelHints = new AbortController(); // aborted when the session ends or on stop (nobody reads a hint then)
  const hintControllers = new Map<number, AbortController>(); // the newest hint of each sentence
  let keyErrorReported = false;

  // One message about a rejected key is enough, however many requests fail because of it.
  function reportKeyRejected(): void {
    if (keyErrorReported) return;
    keyErrorReported = true;
    send({ type: 'error', message: 'Провайдер языковой модели отклонил ключ API. Проверьте ключ в файле .env.' });
  }

  // Starts translating the sentence with this id. Several run at once, nobody waits for another.
  function startTranslation(id: number, restart = false): void {
    const sentence = history[id - 1];
    if (!llm || sentence === undefined) return;

    // Already in the language the user reads: nothing to translate. An empty finished
    // translation shows nothing on the card (and no spinner).
    if (isAlreadyIn(targetLanguage, sentence)) {
      send({ type: 'translation_done', id });
      return;
    }

    // A sentence has one translation at a time: a new request replaces the old one, so two never mix.
    controllers.get(id)?.abort();
    const mine = new AbortController();
    controllers.set(id, mine);

    let job: Promise<void>;
    try {
      job = translate({
        provider: llm,
        model: translationModel,
        id,
        // The user's personal data (profile) is deliberately not passed on: translation does not need it.
        context: { callContext, previous: history.slice(Math.max(0, id - 5), id - 1), sentence, targetLanguage },
        emit: send,
        signal: AbortSignal.any([cancelTranslations.signal, mine.signal]),
        restart,
        onAuthError: reportKeyRejected,
        log,
      });
    } catch (error) {
      job = Promise.reject(error); // a translator that fails at once is handled like one that fails later
    }
    job = job.catch(() => log('session_error translation_crashed'));
    running.add(job);
    void job.finally(() => {
      running.delete(job);
      if (controllers.get(id) === mine) controllers.delete(id);
    });
  }

  // Builds a reply hint for the sentence with this id, on request. One hint per sentence at a time.
  function startHint(id: number, mode: HintMode): void {
    const sentence = history[id - 1];
    if (!llm || sentence === undefined) return;

    hintControllers.get(id)?.abort();
    const mine = new AbortController();
    hintControllers.set(id, mine);

    let job: Promise<void>;
    try {
      job = hint({
        provider: llm,
        model: hintModel,
        id,
        mode,
        context: {
          callContext,
          profile,
          previous: history.slice(Math.max(0, id - 1 - HINT_CONTEXT_SENTENCES), id - 1),
          sentence,
        },
        emit: send,
        signal: AbortSignal.any([cancelHints.signal, mine.signal]),
        onAuthError: reportKeyRejected,
        log,
      });
    } catch (error) {
      job = Promise.reject(error);
    }
    // Not added to `running`: on stop we do not wait for hints.
    void job
      .catch(() => log('session_error hint_crashed'))
      .finally(() => {
        if (hintControllers.get(id) === mine) hintControllers.delete(id); // finished: nothing left to cancel
      });
  }

  // Sends what the sentence assembler produced: finished sentences first, then the live card text.
  // (This is also where translation will be started for each sentence in a later change.)
  function relay(output: AssemblerOutput): void {
    for (const sentence of output.sentences) {
      history[sentence.id - 1] = sentence.text;
      send({ type: 'sentence', id: sentence.id, text: sentence.text, paragraph: paragrapher.next(sentence.text) });
      startTranslation(sentence.id);
    }
    send({ type: 'interim', finalText: output.finalText, interimText: output.interimText });
  }

  function send(message: ServerMessage): void {
    if (state !== 'done') {
      if (message.type !== 'interim') dev?.write('out', message); // the live phrase changes many times a second
      deps.send(message);
    }
  }

  // Closes the recognition stream without ever throwing or leaving a rejected promise behind:
  // a failing close must not take the whole server down.
  function closeStream(): Promise<void> {
    try {
      return Promise.resolve(stream?.close()).catch(() => log('session_error stt_close_failed'));
    } catch {
      log('session_error stt_close_failed');
      return Promise.resolve();
    }
  }

  // Ends the session at once: nothing more is sent, the connection to the browser is closed.
  function finish(): void {
    if (state === 'done') return;
    state = 'done';
    clearTimeout(startTimer);
    cancelTranslations.abort(); // nobody is listening any more
    cancelHints.abort();
    deps.close();
  }

  // Tells the user what went wrong and ends the session.
  function fail(message: string): void {
    send({ type: 'error', message });
    finish();
  }

  const startTimer = setTimeout(() => {
    if (state === 'waiting') {
      log('session_error start_timeout');
      fail('Не получены настройки звонка. Начните заново.');
    }
  }, deps.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS);

  async function handleStart(message: unknown): Promise<void> {
    state = 'starting';
    clearTimeout(startTimer);

    try {
      const check = await validateStart(message, deps.registry);
      if ((state as State) !== 'starting') return; // the browser left while we were checking
      if (!check.ok) {
        log('session_error invalid_start');
        fail(check.message);
        return;
      }

      send({ type: 'status', state: 'connecting' });
      log(
        `session_start provider=${check.start.provider} translation=${check.start.translationModel} hint=${check.start.hintModel}`,
      );
      if (check.start.devLog) {
        dev = deps.openDevLog?.();
        if (dev) {
          // "My data" (profile) is left out: it is personal and the log is about the translation.
          const { profile: _profile, ...settings } = check.start;
          dev.write('session_start', settings);
          send({ type: 'notice', message: `Лог звонка: ${dev.path}` });
        }
      }
      llm = deps.registry.get(check.start.provider);
      translationModel = check.start.translationModel;
      targetLanguage = check.start.targetLanguage;
      callContext = check.start.callContext;
      profile = check.start.profile;
      hintModel = check.start.hintModel;
      state = 'running'; // before opening: the stream may report a failure at once
      stream = deps.stt.open(
        { language: check.start.language },
        {
          onOpen: () => send({ type: 'status', state: 'listening' }),
          onResult(result) {
            if (result.isFinal) dev?.write('stt_final', result);
            relay(assembler.pushResult(result));
          },
          onUtteranceEnd() {
            dev?.write('stt_utterance_end');
            relay(assembler.pushUtteranceEnd());
            send({ type: 'status', state: 'listening' });
          },
          onSpeechStarted: () => send({ type: 'status', state: 'speaking' }),
          onReconnecting: () => send({ type: 'status', state: 'reconnecting' }),
          onRestartRecorder: () => send({ type: 'restart_recorder' }),
          onFatal(error) {
            if (state === 'done') return;
            log(`session_error stt_${error.kind}`);
            send({
              type: 'error',
              message:
                error.kind === 'auth'
                  ? 'Сервис распознавания речи отклонил ключ API. Проверьте DEEPGRAM_API_KEY.'
                  : 'Не удалось подключиться к сервису распознавания речи.',
            });
            send({ type: 'status', state: 'stopped' });
            void closeStream();
            finish();
          },
        },
      );
      // If it failed before open() returned, the stream did not exist yet to be closed.
      if ((state as State) === 'done') void closeStream();
    } catch {
      // Details stay out of the log: an error here could mention the user's settings.
      log('session_error start_failed');
      if ((state as State) !== 'done') fail('Не удалось начать звонок. Попробуйте ещё раз.');
      void closeStream();
    }
  }

  // The user pressed "Стоп". Closing the recognition stream may still deliver the last words,
  // so we wait for it, flush what is left in the sentence buffer, and only then say goodbye.
  async function handleStop(): Promise<void> {
    state = 'ending';
    log('session_stop');
    await closeStream();
    if ((state as State) === 'done') return; // the browser left in the meantime
    cancelHints.abort(); // a hint that is still being written is of no use any more
    relay(assembler.pushUtteranceEnd());
    // Let translations that are still running finish (but not for long): the last sentences are the freshest.
    let grace: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...running]),
      new Promise<void>((resolve) => (grace = setTimeout(resolve, STOP_GRACE_MS))),
    ]);
    clearTimeout(grace);
    if ((state as State) === 'done') return;
    send({ type: 'status', state: 'stopped' });
    finish();
  }

  async function onText(raw: string): Promise<void> {
    if (state === 'done' || state === 'ending') return;

    let message: Partial<ClientMessage> | null;
    try {
      message = JSON.parse(raw);
    } catch {
      message = null;
    }
    const type = message && typeof message === 'object' ? message.type : undefined;

    if (state === 'waiting') {
      if (type === 'start') return handleStart(message);
      log('session_error first_message_not_start');
      return fail('Первым сообщением сессии должно быть «start».');
    }

    if (state === 'starting') {
      if (type === 'stop') {
        // handleStart notices that we are done and opens nothing.
        send({ type: 'status', state: 'stopped' });
        finish();
      } else if (type === 'start') {
        send({ type: 'error', message: 'Сессия уже начата.' });
      }
      return;
    }

    // state === 'running'
    switch (type) {
      case 'stop':
        return handleStop();
      case 'start':
        send({ type: 'error', message: 'Сессия уже начата.' });
        return;
      case 'retranslate': {
        dev?.write('in', message);
        const id = (message as { id?: unknown }).id;
        if (typeof id === 'number' && Number.isInteger(id)) startTranslation(id, true); // unknown ids are ignored there
        return;
      }
      case 'hint': {
        dev?.write('in', message);
        const { id, mode } = message as { id?: unknown; mode?: unknown };
        // Anything unexpected (unknown sentence, odd mode) is ignored: the browser only sends valid requests.
        if (typeof id === 'number' && Number.isInteger(id) && (mode === 'short' || mode === 'detailed'))
          startHint(id, mode);
        return;
      }
      default:
        send({ type: 'error', message: 'Непонятное сообщение от страницы.' });
    }
  }

  function onBinary(chunk: Uint8Array): void {
    if (state === 'waiting') {
      log('session_error audio_before_start');
      fail('Звук пришёл раньше настроек звонка. Начните заново.');
      return;
    }
    if (state === 'running') stream?.send(chunk);
  }

  function onClose(): void {
    if (state === 'done') return;
    state = 'done';
    clearTimeout(startTimer);
    cancelTranslations.abort();
    cancelHints.abort();
    void closeStream();
  }

  return { onText, onBinary, onClose };
}
