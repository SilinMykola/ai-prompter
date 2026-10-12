import type { ClientMessage, ServerMessage } from '@ai-prompter/shared/protocol';
import type { Registry } from './llm';
import type { LlmProvider } from './llm/types';
import { createSentenceAssembler, type AssemblerOutput } from './sentences';
import type { SttProvider, SttStream } from './stt/types';
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
  /** How long to wait for the first message. */
  startTimeoutMs?: number;
  /** Translates one sentence. Replaceable in tests. */
  translate?: (options: TranslateOptions) => Promise<void>;
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
  const log = deps.log ?? (() => {});
  let state: State = 'waiting';
  let stream: SttStream | undefined;
  const assembler = createSentenceAssembler();
  const translate = deps.translate ?? translateSentence;

  // What translation needs, known after a valid `start`.
  let llm: LlmProvider | undefined;
  let translationModel = '';
  let callContext = '';
  // The sentences said so far (index = id - 1): context for the next translations, and for "retranslate".
  const history: string[] = [];
  const running = new Set<Promise<void>>(); // translations in progress
  const cancelTranslations = new AbortController(); // aborted when the session ends
  let keyErrorReported = false;

  // Starts translating the sentence with this id. Several run at once, nobody waits for another.
  function startTranslation(id: number, restart = false): void {
    const sentence = history[id - 1];
    if (!llm || sentence === undefined) return;

    const job = translate({
      provider: llm,
      model: translationModel,
      id,
      // The user's personal data (profile) is deliberately not passed on: translation does not need it.
      context: { callContext, previous: history.slice(Math.max(0, id - 5), id - 1), sentence },
      emit: send,
      signal: cancelTranslations.signal,
      restart,
      onAuthError() {
        if (keyErrorReported) return; // one message is enough, even if many sentences fail
        keyErrorReported = true;
        send({ type: 'error', message: 'Провайдер языковой модели отклонил ключ API. Проверьте ключ в файле .env.' });
      },
      log,
    }).catch(() => log('session_error translation_crashed'));
    running.add(job);
    void job.finally(() => running.delete(job));
  }

  // Sends what the sentence assembler produced: finished sentences first, then the live card text.
  // (This is also where translation will be started for each sentence in a later change.)
  function relay(output: AssemblerOutput): void {
    for (const sentence of output.sentences) {
      history[sentence.id - 1] = sentence.text;
      send({ type: 'sentence', id: sentence.id, text: sentence.text });
      startTranslation(sentence.id);
    }
    send({ type: 'interim', finalText: output.finalText, interimText: output.interimText });
  }

  function send(message: ServerMessage): void {
    if (state !== 'done') deps.send(message);
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
      log(`session_start provider=${check.start.provider} translation=${check.start.translationModel} hint=${check.start.hintModel}`);
      llm = deps.registry.get(check.start.provider);
      translationModel = check.start.translationModel;
      callContext = check.start.callContext;
      state = 'running'; // before opening: the stream may report a failure at once
      stream = deps.stt.open({ language: check.start.language }, {
        onOpen: () => send({ type: 'status', state: 'listening' }),
        onResult: (result) => relay(assembler.pushResult(result)),
        onUtteranceEnd() {
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
      });
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
        const id = (message as { id?: unknown }).id;
        if (typeof id === 'number' && Number.isInteger(id)) startTranslation(id, true); // unknown ids are ignored there
        return;
      }
      case 'hint':
        return; // not implemented yet: accepted and ignored
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
    void closeStream();
  }

  return { onText, onBinary, onClose };
}
