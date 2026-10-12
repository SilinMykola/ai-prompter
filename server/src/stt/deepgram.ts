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

  function open({ language }: { language: Language }, handlers: SttHandlers): SttStream {
    // The key goes in a header, never into the URL (URLs end up in logs and error messages).
    const socket: SocketLike = createSocket(buildUrl(options.model, language), {
      Authorization: `Token ${options.apiKey}`,
    });

    let isOpen = false;
    let closing = false; // close() was called: no more reconnects, wait for the service to finish
    let closed = false; // the connection is gone for good: ignore everything that still arrives
    // Audio that arrived before the connection opened. It must be sent first and in order,
    // because the very first chunk holds the webm header the service needs.
    let pending: Uint8Array[] = [];
    let keepAliveTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const closeWaiters: Array<() => void> = [];

    // (Re)starts the "4 seconds of silence" countdown. Called after every audio send.
    function armKeepAlive(): void {
      clearTimeout(keepAliveTimer);
      keepAliveTimer = setTimeout(() => {
        // KeepAlive must be a text message; a binary one may be misread as audio.
        socket.send(JSON.stringify({ type: 'KeepAlive' }));
        armKeepAlive();
      }, KEEP_ALIVE_AFTER_MS);
    }

    function sendAudio(chunk: Uint8Array): void {
      socket.send(chunk);
      armKeepAlive();
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

    socket.on('open', () => {
      isOpen = true;
      for (const chunk of pending) sendAudio(chunk);
      pending = [];
      armKeepAlive();
      handlers.onOpen();
    });

    socket.on('message', (data: Buffer | string) => {
      if (!closed) handleMessage(data.toString());
    });

    socket.on('close', () => {
      isOpen = false;
      closed = true;
      clearTimeout(keepAliveTimer);
      clearTimeout(closeTimer);
      for (const resolve of closeWaiters.splice(0)) resolve();
    });

    function send(chunk: Uint8Array): void {
      if (closing || closed) return;
      if (isOpen) {
        sendAudio(chunk);
        return;
      }
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
      if (closed) return Promise.resolve();
      closing = true;
      clearTimeout(keepAliveTimer);
      const done = new Promise<void>((resolve) => closeWaiters.push(resolve));
      if (isOpen) {
        socket.send(JSON.stringify({ type: 'CloseStream' }));
        closeTimer = setTimeout(() => socket.terminate(), CLOSE_TIMEOUT_MS);
      } else {
        socket.terminate(); // never opened: nothing to wait for
      }
      return done;
    }

    return { send, close };
  }

  return { open };
}
