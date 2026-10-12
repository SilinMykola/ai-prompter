import type { ClientMessage, ServerMessage } from '@ai-prompter/shared/protocol';
import type { Registry } from './llm';
import { createSentenceAssembler, type AssemblerOutput } from './sentences';
import type { SttProvider, SttStream } from './stt/types';
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

export function createSession(deps: SessionDeps): Session {
  const log = deps.log ?? (() => {});
  let state: State = 'waiting';
  let stream: SttStream | undefined;
  const assembler = createSentenceAssembler();

  // Sends what the sentence assembler produced: finished sentences first, then the live card text.
  // (This is also where translation will be started for each sentence in a later change.)
  function relay(output: AssemblerOutput): void {
    for (const sentence of output.sentences) {
      send({ type: 'sentence', id: sentence.id, text: sentence.text });
    }
    send({ type: 'interim', finalText: output.finalText, interimText: output.interimText });
  }

  function send(message: ServerMessage): void {
    if (state !== 'done') deps.send(message);
  }

  // Ends the session at once: nothing more is sent, the connection to the browser is closed.
  function finish(): void {
    if (state === 'done') return;
    state = 'done';
    clearTimeout(startTimer);
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

    const check = await validateStart(message, deps.registry);
    if ((state as State) !== 'starting') return; // the browser left while we were checking
    if (!check.ok) {
      log('session_error invalid_start');
      fail(check.message);
      return;
    }

    send({ type: 'status', state: 'connecting' });
    log(`session_start provider=${check.start.provider} translation=${check.start.translationModel} hint=${check.start.hintModel}`);
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
        void stream?.close();
        finish();
      },
    });
    state = 'running';
  }

  // The user pressed "Стоп". Closing the recognition stream may still deliver the last words,
  // so we wait for it, flush what is left in the sentence buffer, and only then say goodbye.
  async function handleStop(): Promise<void> {
    state = 'ending';
    log('session_stop');
    await stream?.close();
    if ((state as State) === 'done') return; // the browser left in the meantime
    relay(assembler.pushUtteranceEnd());
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
      if (type === 'stop') finish(); // handleStart notices that we are done and opens nothing
      return;
    }

    // state === 'running'
    switch (type) {
      case 'stop':
        return handleStop();
      case 'start':
        send({ type: 'error', message: 'Сессия уже начата.' });
        return;
      case 'hint':
      case 'retranslate':
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
    void stream?.close();
  }

  return { onText, onBinary, onClose };
}
