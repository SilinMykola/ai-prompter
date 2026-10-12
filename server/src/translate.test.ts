import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@ai-prompter/shared/protocol';
import { LlmError } from './llm/errors';
import type { LlmRequest } from './llm/types';
import { buildTranslationPrompt } from './prompts';
import { translateSentence, type TranslateOptions } from './translate';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// One planned answer of the fake model: pieces to stream, an error to throw (after the pieces), or "hang".
type Plan = { pieces?: string[]; error?: Error; hang?: boolean };

function fakeProvider(plans: Plan[]) {
  const requests: LlmRequest[] = [];
  const provider = {
    stream(request: LlmRequest): AsyncIterable<string> {
      requests.push(request);
      const plan = plans[requests.length - 1] ?? { pieces: [] };
      return (async function* () {
        for (const piece of plan.pieces ?? []) yield piece;
        if (plan.error) throw plan.error;
        if (plan.hang) {
          // Wait until the request is cancelled; a cancelled stream just ends (the provider contract).
          await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => resolve()));
        }
      })();
    },
  };
  return { provider, requests };
}

const context = { callContext: 'Arzttermin', previous: ['Guten Tag.'], sentence: 'Wie ist Ihr Geburtsdatum?' };

function run(plans: Plan[], extra: Partial<TranslateOptions> = {}) {
  const { provider, requests } = fakeProvider(plans);
  const messages: ServerMessage[] = [];
  const sleeps: number[] = [];
  const options: TranslateOptions = {
    provider,
    model: 'fast-model',
    id: 7,
    context,
    emit: (message) => void messages.push(message),
    sleep: async (ms) => void sleeps.push(ms),
    onAuthError: vi.fn(),
    ...extra,
  };
  const done = translateSentence(options);
  return { done, messages, requests, sleeps, options };
}

const types = (messages: ServerMessage[]) => messages.map((m) => m.type);
const llmError = (kind: LlmError['kind']) => new LlmError(kind, `gemini request failed: ${kind}`);

describe('a successful translation', () => {
  it('streams the pieces and then says it is done, with the sentence id', async () => {
    const { done, messages } = run([{ pieces: ['Добрый ', 'день.'] }]);
    await done;

    expect(messages).toEqual([
      { type: 'translation_delta', id: 7, delta: 'Добрый ' },
      { type: 'translation_delta', id: 7, delta: 'день.' },
      { type: 'translation_done', id: 7 },
    ]);
  });

  it('asks the chosen model with the prompt, 300 tokens, temperature 0 and low latency', async () => {
    const { done, requests } = run([{ pieces: ['Да.'] }]);
    await done;

    const prompt = buildTranslationPrompt(context);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: 'fast-model',
      system: prompt.system,
      user: prompt.user,
      maxTokens: 300,
      temperature: 0,
      lowLatency: true,
    });
  });

  it('leaves no timer behind', async () => {
    const { done } = run([{ pieces: ['Да.'] }]);
    await done;

    expect(vi.getTimerCount()).toBe(0);
  });

  it('announces a restart first when a re-translation was requested', async () => {
    const { done, messages } = run([{ pieces: ['Да.'] }], { restart: true });
    await done;

    expect(types(messages)).toEqual(['translation_start', 'translation_delta', 'translation_done']);
  });
});

describe('failures and the retry', () => {
  it('starts over once after an error, announcing it, and then succeeds', async () => {
    const { done, messages, requests } = run([{ pieces: ['Добр'], error: llmError('other') }, { pieces: ['Добрый день.'] }]);
    await done;

    expect(types(messages)).toEqual(['translation_delta', 'translation_start', 'translation_delta', 'translation_done']);
    expect(requests).toHaveLength(2);
  });

  it('reports an error when the second attempt fails too', async () => {
    const { done, messages, requests } = run([{ error: llmError('other') }, { error: llmError('other') }]);
    await done;

    expect(types(messages)).toEqual(['translation_start', 'translation_error']);
    expect(messages.at(-1)).toEqual({ type: 'translation_error', id: 7 });
    expect(requests).toHaveLength(2);
  });

  it('treats an answer without any text as a failure', async () => {
    const { done, messages } = run([{ pieces: [] }, { pieces: ['Да.'] }]);
    await done;

    expect(types(messages)).toEqual(['translation_start', 'translation_delta', 'translation_done']);
  });

  it('stops an attempt after 10 seconds and tries again', async () => {
    const { done, messages, requests } = run([{ hang: true }, { pieces: ['Да.'] }]);

    await vi.advanceTimersByTimeAsync(9999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(requests).toHaveLength(2);
    expect(types(messages)).toEqual(['translation_start', 'translation_delta', 'translation_done']);
  });

  it('gives up after two timeouts', async () => {
    const { done, messages } = run([{ hang: true }, { hang: true }]);

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;

    expect(messages.at(-1)).toEqual({ type: 'translation_error', id: 7 });
  });
});

describe('rate limits', () => {
  it('tells the user, waits 2 seconds, and retries', async () => {
    const { done, messages, sleeps } = run([{ error: llmError('rate_limit') }, { pieces: ['Да.'] }]);
    await done;

    expect(sleeps).toEqual([2000]);
    expect(types(messages)).toEqual(['notice', 'translation_start', 'translation_delta', 'translation_done']);
    expect(messages[0]).toMatchObject({ type: 'notice', message: expect.stringMatching(/лимит/i) });
  });

  it('does not wait before the retry for other errors', async () => {
    const { done, sleeps } = run([{ error: llmError('other') }, { pieces: ['Да.'] }]);
    await done;

    expect(sleeps).toEqual([]);
  });

  it('gives up when the retry is rate limited too', async () => {
    const { done, messages } = run([{ error: llmError('rate_limit') }, { error: llmError('rate_limit') }]);
    await done;

    expect(messages.at(-1)).toEqual({ type: 'translation_error', id: 7 });
  });
});

describe('a rejected key', () => {
  it('is reported through the callback, without a retry', async () => {
    const { done, messages, requests, options } = run([{ error: llmError('auth') }, { pieces: ['Да.'] }]);
    await done;

    expect(options.onAuthError).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(1);
    expect(messages).toEqual([{ type: 'translation_error', id: 7 }]);
  });
});

describe('cancelling', () => {
  it('stays silent when the session aborts in the middle of a stream', async () => {
    const controller = new AbortController();
    const { done, messages, requests } = run([{ pieces: ['Добр'], hang: true }, { pieces: ['x'] }], { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await done;

    expect(types(messages)).toEqual(['translation_delta']);
    expect(requests).toHaveLength(1);
  });

  it('does not start at all when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { done, messages, requests } = run([{ pieces: ['x'] }], { signal: controller.signal });
    await done;

    expect(messages).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('stays silent when the session aborts during the rate-limit wait', async () => {
    const controller = new AbortController();
    let wake!: () => void;
    const { done, messages, requests } = run([{ error: llmError('rate_limit') }, { pieces: ['x'] }], {
      signal: controller.signal,
      sleep: () => new Promise<void>((resolve) => (wake = resolve)),
    });
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    wake();
    await done;

    expect(types(messages)).toEqual(['notice']);
    expect(requests).toHaveLength(1);
  });
});

describe('review fixes', () => {
  it('counts an answer of only empty pieces as a failure', async () => {
    const { done, messages } = run([{ pieces: ['', '  '] }, { pieces: ['Да.'] }]);
    await done;

    expect(types(messages)).toContain('translation_start');
    expect(messages.at(-1)).toEqual({ type: 'translation_done', id: 7 });
  });

  it('recognises a timeout even when the provider throws an abort error instead of ending quietly', async () => {
    const requests: LlmRequest[] = [];
    const provider = {
      stream(request: LlmRequest): AsyncIterable<string> {
        requests.push(request);
        return (async function* () {
          if (requests.length === 1) {
            await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => resolve()));
            throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
          }
          yield 'Да.';
        })();
      },
    };
    const messages: ServerMessage[] = [];
    const done = translateSentence({ provider, model: 'm', id: 7, context, emit: (m) => void messages.push(m), sleep: async () => {} });

    await vi.advanceTimersByTimeAsync(10_000);
    await done;

    expect(requests).toHaveLength(2);
    expect(types(messages)).toEqual(['translation_start', 'translation_delta', 'translation_done']);
  });
});

describe('privacy', () => {
  it('logs events but never the sentence or the translation', async () => {
    const log = vi.fn();
    const { done } = run([{ pieces: ['GEHEIME Übersetzung'], error: llmError('other') }, { pieces: ['Fertig'] }], {
      log,
      context: { ...context, sentence: 'GEHEIMER Satz' },
    });
    await done;

    expect(log).toHaveBeenCalled();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('GEHEIM');
  });
});
