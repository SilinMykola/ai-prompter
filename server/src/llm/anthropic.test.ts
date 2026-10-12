import { describe, expect, it } from 'vitest';
import { createAnthropicProvider, type AnthropicClient } from './anthropic';
import type { LlmRequest } from './types';

const request: LlmRequest = { model: 'claude-test', system: 'SYS', user: 'USER', maxTokens: 200, temperature: 0 };

const abortError = () => Object.assign(new Error('aborted'), { name: 'APIUserAbortError' });
const httpError = (status: number) => Object.assign(new Error('boom'), { status });

type CreateParams = Parameters<AnthropicClient['messages']['create']>[0];
type CreateOptions = Parameters<AnthropicClient['messages']['create']>[1];

/** Fake Anthropic client: `plan` is the pieces to stream, or an Error (thrown on the call or mid-stream). */
function fakeClient(plan: Array<string | Error> | Error, ids: string[] = []) {
  const calls: Array<{ params: CreateParams; options: CreateOptions }> = [];
  const client: AnthropicClient = {
    models: {
      list() {
        return (async function* () {
          for (const id of ids) yield { id };
        })();
      },
    },
    messages: {
      async create(params, options) {
        calls.push({ params, options });
        if (plan instanceof Error) throw plan;
        return (async function* () {
          yield { type: 'message_start' };
          for (const piece of plan) {
            if (piece instanceof Error) throw piece;
            // Real streams mix text events with other events; only text deltas matter.
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: piece } };
            // Other delta kinds must never leak into the answer, even if they carry a "text" field.
            yield { type: 'content_block_delta', delta: { type: 'thinking_delta', text: 'HIDDEN' } };
          }
          yield { type: 'message_stop' };
        })();
      },
    },
  };
  return { client, calls };
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const piece of stream) out.push(piece);
  return out;
}

describe('anthropic stream', () => {
  it('yields only text pieces, in order', async () => {
    const { client } = fakeClient(['Привет', ', ', 'мир']);

    expect(await collect(createAnthropicProvider({ client }).stream(request))).toEqual(['Привет', ', ', 'мир']);
  });

  it('passes model, prompts, limits and the abort signal', async () => {
    const { client, calls } = fakeClient(['x']);
    const controller = new AbortController();

    await collect(createAnthropicProvider({ client }).stream({ ...request, signal: controller.signal }));

    expect(calls[0].params).toMatchObject({
      model: 'claude-test',
      system: 'SYS',
      max_tokens: 200,
      temperature: 0,
      stream: true,
      messages: [{ role: 'user', content: 'USER' }],
    });
    expect(calls[0].options?.signal).toBe(controller.signal);
  });

  it('ends quietly on abort', async () => {
    const { client } = fakeClient(['a', abortError()]);

    expect(await collect(createAnthropicProvider({ client }).stream(request))).toEqual(['a']);
  });

  it('turns failures into LlmError', async () => {
    await expect(collect(createAnthropicProvider({ client: fakeClient(httpError(429)).client }).stream(request))).rejects.toMatchObject({
      name: 'LlmError',
      kind: 'rate_limit',
    });
    await expect(collect(createAnthropicProvider({ client: fakeClient(['a', httpError(401)]).client }).stream(request))).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('ignores the low-latency flag', async () => {
    const { client, calls } = fakeClient(['x']);

    await collect(createAnthropicProvider({ client }).stream({ ...request, lowLatency: true }));

    expect(calls).toHaveLength(1);
  });
});

describe('anthropic listModels', () => {
  it('returns claude models only', async () => {
    const { client } = fakeClient([], ['claude-sonnet-5-5', 'other-model', 'claude-haiku-5-5']);

    expect(await createAnthropicProvider({ client }).listModels()).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
  });

  it('identifies itself', () => {
    const provider = createAnthropicProvider({ client: fakeClient([]).client });

    expect(provider.id).toBe('anthropic');
    expect(provider.label).toBe('Claude');
  });
});
