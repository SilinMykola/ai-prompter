import WebSocket from 'ws';
import type { Language } from '@ai-prompter/shared/protocol';
import type { SocketFactory, SocketLike, SttHandlers, SttProvider, SttStream } from './types';

// Speech-to-text through Deepgram's streaming API over a plain WebSocket (no SDK).
// Docs: https://developers.deepgram.com/docs/live-streaming-audio

const LISTEN_URL = 'wss://api.deepgram.com/v1/listen';

// The browser sends a chunk every 250 ms, so 5 seconds of audio is 20 chunks.
const MAX_BUFFERED_CHUNKS = 20;

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
    // Audio that arrived before the connection opened. It must be sent first and in order,
    // because the very first chunk holds the webm header the service needs.
    let pending: Uint8Array[] = [];

    socket.on('open', () => {
      isOpen = true;
      for (const chunk of pending) socket.send(chunk);
      pending = [];
      handlers.onOpen();
    });

    function send(chunk: Uint8Array): void {
      if (isOpen) {
        socket.send(chunk);
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

    async function close(): Promise<void> {
      socket.close();
    }

    return { send, close };
  }

  return { open };
}
