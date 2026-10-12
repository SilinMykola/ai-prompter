import { describe, expect, it } from 'vitest';
import type { ApiConfig, ClientMessage, ServerMessage } from './protocol';

// These tests pin the shape of every message. Vitest only runs the runtime part;
// the real protection is the type check (`npm run typecheck`): if a field is renamed
// or a variant is added without updating this file, tsc reports an error.

// An exhaustive switch: if a new variant is added to the union and not handled here,
// `message` is no longer `never` in the default branch and tsc fails.
function clientKind(message: ClientMessage): string {
  switch (message.type) {
    case 'start':
    case 'hint':
    case 'retranslate':
    case 'stop':
      return message.type;
    default: {
      const unreachable: never = message;
      return unreachable;
    }
  }
}

function serverKind(message: ServerMessage): string {
  switch (message.type) {
    case 'status':
    case 'interim':
    case 'sentence':
    case 'translation_delta':
    case 'translation_done':
    case 'translation_error':
    case 'hint_start':
    case 'hint_delta':
    case 'hint_done':
    case 'hint_error':
    case 'restart_recorder':
    case 'error':
      return message.type;
    default: {
      const unreachable: never = message;
      return unreachable;
    }
  }
}

describe('client messages', () => {
  const messages: ClientMessage[] = [
    {
      type: 'start',
      language: 'multi',
      provider: 'gemini',
      translationModel: 'fast-model',
      hintModel: 'strong-model',
      callContext: '',
      profile: '',
    },
    { type: 'hint', id: 1, mode: 'short' },
    { type: 'hint', id: 1, mode: 'detailed' },
    { type: 'retranslate', id: 1 },
    { type: 'stop' },
  ];

  it('covers all 4 message types', () => {
    expect(new Set(messages.map(clientKind))).toEqual(new Set(['start', 'hint', 'retranslate', 'stop']));
  });
});

describe('server messages', () => {
  const messages: ServerMessage[] = [
    { type: 'status', state: 'connecting' },
    { type: 'status', state: 'listening' },
    { type: 'status', state: 'speaking' },
    { type: 'status', state: 'reconnecting' },
    { type: 'status', state: 'stopped' },
    { type: 'interim', finalText: 'Guten', interimText: 'Tag' },
    { type: 'sentence', id: 1, text: 'Guten Tag.' },
    { type: 'sentence', id: 2, text: 'Hello.', language: 'en' },
    { type: 'translation_delta', id: 1, delta: 'Добрый' },
    { type: 'translation_done', id: 1 },
    { type: 'translation_error', id: 1 },
    { type: 'hint_start', id: 1, mode: 'short' },
    { type: 'hint_delta', id: 1, delta: 'Ja' },
    { type: 'hint_done', id: 1 },
    { type: 'hint_error', id: 1 },
    { type: 'restart_recorder' },
    { type: 'error', message: 'Что-то пошло не так' },
  ];

  it('covers all 12 message types', () => {
    expect(new Set(messages.map(serverKind)).size).toBe(12);
  });
});

describe('api config', () => {
  it('has a default provider and providers with models', () => {
    const config: ApiConfig = {
      defaultProvider: 'gemini',
      providers: [{ id: 'gemini', label: 'Gemini', models: ['a', 'b'] }],
    };
    expect(config.providers[0].models).toHaveLength(2);
  });
});
