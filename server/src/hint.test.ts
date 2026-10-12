import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@ai-prompter/shared/protocol';
import { streamHint, type HintOptions } from './hint';
import { LlmError } from './llm/errors';
import type { LlmRequest } from './llm/types';
import { buildHintPrompt } from './prompts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Plan = { pieces?: string[]; error?: Error; hang?: boolean };

function fakeProvider(plan: Plan) {
  const requests: LlmRequest[] = [];
  const provider = {
    stream(request: LlmRequest): AsyncIterable<string> {
      requests.push(request);
      return (async function* () {
        for (const piece of plan.pieces ?? []) yield piece;
        if (plan.error) throw plan.error;
        if (plan.hang) await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => resolve()));
      })();
    },
  };
  return { provider, requests };
}

const context = { callContext: 'Techniker-Interview', profile: 'Magento-Entwickler', previous: ['Hallo.'], sentence: 'Wie erstellt man einen Indexer?' };

function run(plan: Plan, extra: Partial<HintOptions> = {}) {
  const { provider, requests } = fakeProvider(plan);
  const messages: ServerMessage[] = [];
  const options: HintOptions = {
    provider,
    model: 'strong-model',
    id: 4,
    mode: 'short',
    context,
    emit: (message) => void messages.push(message),
    onAuthError: vi.fn(),
    ...extra,
  };
  return { done: streamHint(options), messages, requests, options };
}

const types = (messages: ServerMessage[]) => messages.map((m) => m.type);
const llmError = (kind: LlmError['kind']) => new LlmError(kind, `gemini request failed: ${kind}`);

describe('a successful hint', () => {
  it('announces the mode, streams the pieces and says it is done', async () => {
    const { done, messages } = run({ pieces: ['Ja, ', 'gern.'] }, { mode: 'detailed' });
    await done;

    expect(messages).toEqual([
      { type: 'hint_start', id: 4, mode: 'detailed' },
      { type: 'hint_delta', id: 4, delta: 'Ja, ' },
      { type: 'hint_delta', id: 4, delta: 'gern.' },
      { type: 'hint_done', id: 4 },
    ]);
  });

  it.each(['short', 'detailed'] as const)('asks the hint model with the %s prompt and its limits, without the low-latency flag', async (mode) => {
    const { done, requests } = run({ pieces: ['x'] }, { mode });
    await done;

    const prompt = buildHintPrompt(mode, context);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: 'strong-model',
      system: prompt.system,
      user: prompt.user,
      maxTokens: prompt.maxTokens,
      temperature: prompt.temperature,
    });
    expect(requests[0].lowLatency).toBeUndefined();
  });

  it('leaves no timer behind', async () => {
    const { done } = run({ pieces: ['x'] });
    await done;

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('failures', () => {
  it('reports an error in the middle of a hint, keeping what was sent', async () => {
    const { done, messages } = run({ pieces: ['Ja, '], error: llmError('other') });
    await done;

    expect(types(messages)).toEqual(['hint_start', 'hint_delta', 'hint_error']);
    expect(messages.at(-1)).toEqual({ type: 'hint_error', id: 4 });
  });

  it.each([[[]], [['', '  ']]])('treats an answer without text (%j) as a failure', async (pieces) => {
    const { done, messages } = run({ pieces });
    await done;

    expect(messages.at(-1)).toEqual({ type: 'hint_error', id: 4 });
    expect(messages).not.toContainEqual({ type: 'hint_done', id: 4 });
  });

  it('gives up after 45 seconds, without a retry', async () => {
    const { done, messages, requests } = run({ hang: true });

    await vi.advanceTimersByTimeAsync(44_999);
    expect(messages.at(-1)).toEqual({ type: 'hint_start', id: 4, mode: 'short' });
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(messages.at(-1)).toEqual({ type: 'hint_error', id: 4 });
    expect(requests).toHaveLength(1);
  });

  it('tells the user about a rate limit and then reports the error', async () => {
    const { done, messages } = run({ error: llmError('rate_limit') });
    await done;

    expect(types(messages)).toEqual(['hint_start', 'notice', 'hint_error']);
    expect(messages[1]).toMatchObject({ type: 'notice', message: expect.stringMatching(/лимит/i) });
  });

  it('passes a rejected key on through the callback', async () => {
    const { done, messages, options } = run({ error: llmError('auth') });
    await done;

    expect(options.onAuthError).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)).toEqual({ type: 'hint_error', id: 4 });
  });
});

describe('cancelling', () => {
  it('stays silent after the signal fired in the middle of a stream', async () => {
    const controller = new AbortController();
    const { done, messages } = run({ pieces: ['Ja'], hang: true }, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await done;

    expect(types(messages)).toEqual(['hint_start', 'hint_delta']);
  });

  it('does nothing at all when cancelled before it starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const { done, messages, requests } = run({ pieces: ['x'] }, { signal: controller.signal });
    await done;

    expect(messages).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('stays silent when the provider throws an abort error after the signal fired', async () => {
    const controller = new AbortController();
    const provider = {
      stream: (request: LlmRequest) =>
        (async function* () {
          yield 'Ja';
          await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => resolve()));
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        })(),
    };
    const messages: ServerMessage[] = [];
    const done = streamHint({ provider, model: 'm', id: 4, mode: 'short', context, emit: (m) => void messages.push(m), signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await done;

    expect(types(messages)).toEqual(['hint_start', 'hint_delta']);
  });
});

describe('privacy', () => {
  it('logs events but never the sentence, the profile or the hint', async () => {
    const log = vi.fn();
    const { done } = run({ pieces: ['GEHEIMER Tipp'], error: llmError('other') }, { log, context: { ...context, sentence: 'GEHEIMER Satz', profile: 'GEHEIMES Profil' } });
    await done;

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('GEHEIM');
  });
});
