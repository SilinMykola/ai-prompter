import { describe, expect, it } from 'vitest';
import { LlmError } from './errors';
import { createGeminiProvider, type GeminiClient } from './gemini';
import type { LlmRequest } from './types';

const request: LlmRequest = { model: 'gemini-test', system: 'SYS', user: 'USER', maxTokens: 300, temperature: 0 };

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const httpError = (status: number) => Object.assign(new Error('boom'), { status });

type StreamParams = Parameters<GeminiClient['models']['generateContentStream']>[0];

/**
 * A fake Gemini client. Each entry of `plans` describes one generateContentStream call:
 * either an error to throw, or the pieces to stream (a piece can also be an Error to throw mid-stream).
 */
function fakeClient(plans: Array<Error | Array<string | Error>>) {
  const calls: StreamParams[] = [];
  const client: GeminiClient = {
    models: {
      async list() {
        return (async function* () {
          yield { name: 'models/gemini-3.5-flash', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-3.5-flash-preview-tts', supportedActions: ['generateContent'] };
        })();
      },
      async generateContentStream(params) {
        calls.push(params);
        const plan = plans[calls.length - 1] ?? [];
        if (plan instanceof Error) throw plan;
        return (async function* () {
          for (const piece of plan) {
            if (piece instanceof Error) throw piece;
            yield { text: piece };
          }
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

describe('gemini stream', () => {
  it('yields the pieces in order and skips empty ones', async () => {
    const { client } = fakeClient([['Привет', '', ', ', 'мир']]);

    expect(await collect(createGeminiProvider({ client }).stream(request))).toEqual(['Привет', ', ', 'мир']);
  });

  it('passes model, prompts and limits to the service', async () => {
    const { client, calls } = fakeClient([['x']]);
    const controller = new AbortController();

    await collect(createGeminiProvider({ client }).stream({ ...request, signal: controller.signal }));

    expect(calls[0].model).toBe('gemini-test');
    expect(calls[0].contents).toBe('USER');
    expect(calls[0].config).toMatchObject({
      systemInstruction: 'SYS',
      maxOutputTokens: 300,
      temperature: 0,
      abortSignal: controller.signal,
    });
  });

  it('ends quietly when the request is aborted mid-stream', async () => {
    const { client } = fakeClient([['a', abortError()]]);

    expect(await collect(createGeminiProvider({ client }).stream(request))).toEqual(['a']);
  });

  it('ends quietly when the signal is already aborted', async () => {
    const { client } = fakeClient([httpError(500)]);
    const controller = new AbortController();
    controller.abort();

    expect(await collect(createGeminiProvider({ client }).stream({ ...request, signal: controller.signal }))).toEqual([]);
  });

  it('turns service failures into LlmError', async () => {
    const { client } = fakeClient([httpError(429)]);

    await expect(collect(createGeminiProvider({ client }).stream(request))).rejects.toMatchObject({
      name: 'LlmError',
      kind: 'rate_limit',
    });
  });

  it('turns failures in the middle of a stream into LlmError', async () => {
    const { client } = fakeClient([['a', httpError(401)]]);

    const attempt = collect(createGeminiProvider({ client }).stream(request));

    await expect(attempt).rejects.toBeInstanceOf(LlmError);
    await expect(attempt).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('gemini low-latency requests', () => {
  it('ask for minimal thinking', async () => {
    const { client, calls } = fakeClient([['x']]);

    await collect(createGeminiProvider({ client }).stream({ ...request, lowLatency: true }));

    expect(calls[0].config).toMatchObject({ thinkingConfig: { thinkingLevel: 'MINIMAL' } });
  });

  it('leave thinking alone for normal requests', async () => {
    const { client, calls } = fakeClient([['x']]);

    await collect(createGeminiProvider({ client }).stream(request));

    expect(calls[0].config?.thinkingConfig).toBeUndefined();
  });

  it('retry once without the setting when the model rejects it, and remember that', async () => {
    const { client, calls } = fakeClient([httpError(400), ['ok'], ['again']]);
    const provider = createGeminiProvider({ client });

    expect(await collect(provider.stream({ ...request, lowLatency: true }))).toEqual(['ok']);
    expect(calls).toHaveLength(2);
    expect(calls[1].config?.thinkingConfig).toBeUndefined();

    // The next request for the same model does not even try the setting.
    expect(await collect(provider.stream({ ...request, lowLatency: true }))).toEqual(['again']);
    expect(calls).toHaveLength(3);
    expect(calls[2].config?.thinkingConfig).toBeUndefined();
  });

  it('do not retry when the 400 comes after text was already streamed', async () => {
    const { client, calls } = fakeClient([['a', httpError(400)]]);

    await expect(collect(createGeminiProvider({ client }).stream({ ...request, lowLatency: true }))).rejects.toMatchObject({
      kind: 'other',
    });
    expect(calls).toHaveLength(1);
  });

  it('do not retry a 400 on a request that did not ask for the setting', async () => {
    const { client, calls } = fakeClient([httpError(400)]);

    await expect(collect(createGeminiProvider({ client }).stream(request))).rejects.toBeInstanceOf(LlmError);
    expect(calls).toHaveLength(1);
  });

  it('do not remember the rejection when the retry fails with the same 400 (the prompt was the problem)', async () => {
    const { client, calls } = fakeClient([httpError(400), httpError(400), ['fine']]);
    const provider = createGeminiProvider({ client });

    await expect(collect(provider.stream({ ...request, lowLatency: true }))).rejects.toBeInstanceOf(LlmError);
    await collect(provider.stream({ ...request, lowLatency: true }));

    // The third call (first of the second request) still asked for minimal thinking.
    expect(calls[2].config?.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('fail with LlmError when the retry fails too', async () => {
    const { client } = fakeClient([httpError(400), httpError(500)]);

    await expect(collect(createGeminiProvider({ client }).stream({ ...request, lowLatency: true }))).rejects.toMatchObject({
      kind: 'other',
      status: 500,
    });
  });
});

describe('gemini listModels', () => {
  it('returns only chat models', async () => {
    const { client } = fakeClient([]);

    expect(await createGeminiProvider({ client }).listModels()).toEqual(['gemini-3.5-flash']);
  });

  it('identifies itself', () => {
    const provider = createGeminiProvider({ client: fakeClient([]).client });

    expect(provider.id).toBe('gemini');
    expect(provider.label).toBe('Gemini');
  });
});
