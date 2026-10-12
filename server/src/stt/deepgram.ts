import WebSocket from 'ws';
import type { Language } from '@ai-prompter/shared/protocol';
import type { SocketFactory, SocketLike, SttHandlers, SttProvider, SttStream } from './types';

// Speech-to-text through Deepgram's streaming API over a plain WebSocket (no SDK).
// Docs: https://developers.deepgram.com/docs/live-streaming-audio

const LISTEN_URL = 'wss://api.deepgram.com/v1/listen';

// The browser sends a chunk every 250 ms, so 5 seconds of audio is 20 chunks.
const MAX_BUFFERED_CHUNKS = 20;

// Deepgram drops a connection that gets neither audio nor KeepAlive for 10 seconds.
// A KeepAlive after 4 quiet seconds leaves a safe margin (its docs advise every 3-5 s).
const KEEP_ALIVE_AFTER_MS = 4000;

// After CloseStream we wait this long for the last results before cutting the connection.
const CLOSE_TIMEOUT_MS = 2000;

// Waits before reconnect attempts 1..5. After the fifth failed attempt we give up.
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

// `ws` is the default way to create a socket; tests pass a fake one instead.
const defaultSocketFactory: SocketFactory = (url, headers) => new WebSocket(url, { headers });

export interface DeepgramOptions {
  apiKey: string;
  /** For example "nova-3". */
  model: string;
  createSocket?: SocketFactory;
  /** Receives event names and codes only. Transcripts must never be passed to it. */
  log?: (event: string) => void;
}

function buildUrl(model: string, language: Language): string {
  // No `encoding` / `sample_rate`: the browser sends webm, a container whose header tells Deepgram the format.
  const params = new URLSearchParams({
    model,
    language,
    interim_results: 'true',
    smart_format: 'true',
    punctuate: 'true',
    endpointing: '300',
    utterance_end_ms: '1000',
    vad_events: 'true',
  });
  return `${LISTEN_URL}?${params}`;
}

export function createDeepgramProvider(options: DeepgramOptions): SttProvider {
  const createSocket = options.createSocket ?? defaultSocketFactory;
  const log = options.log ?? (() => {});

  function open({ language }: { language: Language }, handlers: SttHandlers): SttStream {
    const url = buildUrl(options.model, language);
    // The key goes in a header, never into the URL (URLs end up in logs and error messages).
    const headers = { Authorization: `Token ${options.apiKey}` };

    // --- state of the whole stream (lives across reconnects) ---
    let socket: SocketLike | undefined;
    let isOpen = false; // the current socket is open
    let everOpened = false; // some socket was open before: from then on, a new connection needs a fresh header
    let inOutage = false; // connection lost, retrying
    let retries = 0; // retries since the last good connection
    let closing = false; // close() was called: no more reconnects, wait for the service to finish
    let finished = false; // over for good (closed or fatal): ignore everything
    // Audio that arrived before the first connection opened. It is sent first and in order,
    // because the very first chunk holds the webm header the service needs.
    let pending: Uint8Array[] = [];
    let keepAliveTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const closeWaiters: Array<() => void> = [];

    function finish(): void {
      finished = true;
      clearTimeout(keepAliveTimer);
      clearTimeout(closeTimer);
      clearTimeout(retryTimer);
      for (const resolve of closeWaiters.splice(0)) resolve();
    }

    // (Re)starts the "4 seconds of silence" countdown. Called after every audio send.
    function armKeepAlive(current: SocketLike): void {
      clearTimeout(keepAliveTimer);
      keepAliveTimer = setTimeout(() => {
        // KeepAlive must be a text message; a binary one may be misread as audio.
        current.send(JSON.stringify({ type: 'KeepAlive' }));
        armKeepAlive(current);
      }, KEEP_ALIVE_AFTER_MS);
    }

    function sendAudio(current: SocketLike, chunk: Uint8Array): void {
      current.send(chunk);
      armKeepAlive(current);
    }

    // Turns one message from the service into a callback. Unknown or broken messages are ignored.
    function handleMessage(raw: string): void {
      let message: any;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      switch (message?.type) {
        case 'Results': {
          const alternative = message.channel?.alternatives?.[0];
          if (!alternative) return;
          handlers.onResult({
            transcript: String(alternative.transcript ?? ''),
            isFinal: message.is_final === true,
            speechFinal: message.speech_final === true,
          });
          return;
        }
        case 'UtteranceEnd':
          // last_word_end of -1 means "finalised too early", the message carries no news.
          if (message.last_word_end !== -1) handlers.onUtteranceEnd();
          return;
        case 'SpeechStarted':
          handlers.onSpeechStarted();
          return;
        default:
          return; // Metadata and anything new
      }
    }

    function fatal(kind: 'auth' | 'connection', message: string): void {
      log(`stt_fatal ${kind}`);
      finish();
      handlers.onFatal({ kind, message });
    }

    // The connection was lost (or an attempt failed): wait, then try again, or give up.
    function scheduleReconnect(): void {
      if (retries >= RECONNECT_DELAYS_MS.length) {
        fatal('connection', 'Could not reconnect to the speech recognition service');
        return;
      }
      if (!inOutage) {
        inOutage = true;
        handlers.onReconnecting();
      }
      const delay = RECONNECT_DELAYS_MS[retries++];
      log(`stt_reconnect attempt=${retries}`);
      retryTimer = setTimeout(connect, delay);
    }

    function connect(): void {
      const current = createSocket(url, headers);
      socket = current;
      isOpen = false;
      let gotMessage = false;
      // Events of a socket we have already replaced must not change anything.
      const stale = () => socket !== current || finished;

      current.on('open', () => {
        if (stale()) return;
        isOpen = true;
        log('stt_open');
        // A reconnect needs a fresh webm header: whatever audio we held is useless.
        const reconnected = everOpened;
        everOpened = true;
        inOutage = false;
        for (const chunk of pending) sendAudio(current, chunk);
        pending = [];
        armKeepAlive(current);
        handlers.onOpen();
        if (reconnected) handlers.onRestartRecorder();
      });

      current.on('message', (data: Buffer | string) => {
        if (stale()) return;
        if (!gotMessage) {
          gotMessage = true;
          retries = 0; // this connection works: a later loss starts the schedule from the beginning
        }
        handleMessage(data.toString());
      });

      // Without an 'error' listener Node would crash on a network error. The details
      // are not needed: 'close' follows and drives the reconnect.
      current.on('error', () => {
        if (!stale()) log('stt_socket_error');
      });

      // HTTP answer instead of a WebSocket upgrade: usually a rejected key.
      current.on('unexpected-response', (_request: unknown, response: { statusCode?: number }) => {
        if (stale()) return;
        log(`stt_rejected status=${response.statusCode}`);
        if (response.statusCode === 401 || response.statusCode === 403) {
          fatal('auth', 'The speech recognition service rejected the API key');
        }
        current.terminate();
      });

      current.on('close', (code: number) => {
        if (stale()) return;
        isOpen = false;
        clearTimeout(keepAliveTimer);
        log(`stt_closed code=${code}`);
        if (closing) {
          finish();
        } else {
          scheduleReconnect();
        }
      });
    }

    function send(chunk: Uint8Array): void {
      if (closing || finished) return;
      if (isOpen) {
        sendAudio(socket!, chunk);
        return;
      }
      if (everOpened) return; // reconnecting: this chunk has no container header, the service could not use it
      if (pending.length >= MAX_BUFFERED_CHUNKS) {
        // Too long to connect. Dropping only the oldest chunks would lose the webm header,
        // so drop everything and let the browser start a new recording (with a new header).
        pending = [];
        handlers.onRestartRecorder();
        return;
      }
      pending.push(chunk);
    }

    // Ends the stream politely: CloseStream makes the service finish the words it is still
    // processing, so we wait for its goodbye (or 2 seconds) before hanging up.
    function close(): Promise<void> {
      if (finished) return Promise.resolve();
      closing = true;
      clearTimeout(keepAliveTimer);
      clearTimeout(retryTimer);
      const done = new Promise<void>((resolve) => closeWaiters.push(resolve));
      if (isOpen) {
        socket!.send(JSON.stringify({ type: 'CloseStream' }));
        closeTimer = setTimeout(() => socket!.terminate(), CLOSE_TIMEOUT_MS);
      } else if (inOutage) {
        finish(); // between attempts: there is no connection to close
      } else {
        socket!.terminate(); // never opened: nothing to wait for
      }
      return done;
    }

    connect();
    return { send, close };
  }

  return { open };
}
