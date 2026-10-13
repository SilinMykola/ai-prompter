import { vi } from 'vitest';
import type { ProviderId, ServerMessage } from '@ai-prompter/shared/protocol';
import type { LlmProvider } from './llm/types';
import type { SttHandlers, SttProvider, SttStream } from './stt/types';

// Fakes shared by the session and endpoint tests.

/** A registry with Gemini only and two models. */
const provider = { id: 'gemini', label: 'Gemini' } as LlmProvider;
export const fakeRegistry = {
  get: (id: ProviderId) => (id === 'gemini' ? provider : undefined),
  modelsOf: async (id: ProviderId) => (id === 'gemini' ? ['fast', 'strong'] : []),
};

export const validStart = {
  type: 'start',
  language: 'de',
  targetLanguage: 'ru',
  provider: 'gemini',
  translationModel: 'fast',
  hintModel: 'strong',
  callContext: 'CONTEXT-TEXT',
  profile: 'PROFILE-TEXT',
};

export interface OpenedStream {
  language: string;
  handlers: SttHandlers;
  sent: Uint8Array[];
  closeCalls: number;
  /** Runs inside close(), before it resolves: lets a test deliver "last words". */
  whileClosing?: () => void;
}

/** A speech-to-text provider that records what the session does and lets the test play the service. */
export function fakeStt() {
  const opened: OpenedStream[] = [];
  const provider: SttProvider = {
    open({ language }, handlers) {
      const record: OpenedStream = { language, handlers, sent: [], closeCalls: 0 };
      opened.push(record);
      const stream: SttStream = {
        send: (chunk) => void record.sent.push(chunk),
        close: async () => {
          record.closeCalls++;
          await Promise.resolve(); // the real stream needs time to finish: results arrive *after* close() was called
          record.whileClosing?.();
        },
      };
      return stream;
    },
  };
  return { provider, opened };
}

/** Collects what the session sends to the browser. */
export function fakeConnection() {
  const messages: ServerMessage[] = [];
  const send = vi.fn((message: ServerMessage) => void messages.push(message));
  const close = vi.fn();
  return { messages, send, close };
}

export const types = (messages: ServerMessage[]) => messages.map((m) => m.type);
