import type { Language } from '@ai-prompter/shared/protocol';
import type { SttResult } from '../sentences';

// A speech-to-text provider turns an audio stream into recognition events.
// Deepgram is the only implementation now; the interface keeps the rest of the server
// independent of it, so another engine could be added later.

/** The stream cannot continue and will not retry. */
export interface SttFatalError {
  /** `auth`: the service rejected the API key. `connection`: it kept failing to connect. */
  kind: 'auth' | 'connection';
  message: string;
}

/** What the caller wants to be told about. All callbacks are called from the stream's own events. */
export interface SttHandlers {
  /** The connection to the service is open (also after a reconnect). */
  onOpen(): void;
  onResult(result: SttResult): void;
  /** The speaker stopped talking for a while. */
  onUtteranceEnd(): void;
  onSpeechStarted(): void;
  /** The connection was lost; retrying. */
  onReconnecting(): void;
  /** The recorder must be restarted: the service needs a fresh container header. */
  onRestartRecorder(): void;
  onFatal(error: SttFatalError): void;
}

export interface SttStream {
  /** Sends one audio chunk (a piece of a webm/opus recording). */
  send(chunk: Uint8Array): void;
  /** Ends the stream politely; resolves when the connection is closed. */
  close(): Promise<void>;
}

export interface SttProvider {
  open(options: { language: Language }, handlers: SttHandlers): SttStream;
}

// The few WebSocket features we use. The `ws` library's WebSocket fits this,
// and tests can pass a fake socket.
export interface SocketLike {
  send(data: Uint8Array | string): void;
  /** Hangs up at once, without a closing handshake. */
  terminate(): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export type SocketFactory = (url: string, headers: Record<string, string>) => SocketLike;
