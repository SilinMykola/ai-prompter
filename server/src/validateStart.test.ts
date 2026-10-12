import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@ai-prompter/shared/protocol';
import type { LlmProvider } from './llm/types';
import { validateStart } from './validateStart';

// A registry that has only Gemini with two models. The real one is tested separately.
const provider = { id: 'gemini', label: 'Gemini' } as LlmProvider;
const registry = {
  get: (id: ProviderId) => (id === 'gemini' ? provider : undefined),
  modelsOf: async (id: ProviderId) => (id === 'gemini' ? ['fast', 'strong'] : []),
};

const validStart = {
  type: 'start',
  language: 'de',
  provider: 'gemini',
  translationModel: 'fast',
  hintModel: 'strong',
  callContext: 'Arzttermin',
  profile: 'Name: Test',
};

describe('validateStart', () => {
  it('accepts a valid start and returns it', async () => {
    const result = await validateStart(validStart, registry);

    expect(result).toEqual({ ok: true, start: validStart });
  });

  it('rejects a provider that is not available, in Russian', async () => {
    const result = await validateStart({ ...validStart, provider: 'anthropic' }, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/недоступен/);
  });

  it('rejects an unknown translation model', async () => {
    const result = await validateStart({ ...validStart, translationModel: 'nope' }, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/перевода/);
  });

  it('rejects an unknown hint model', async () => {
    const result = await validateStart({ ...validStart, hintModel: 'nope' }, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/подсказок/);
  });

  it('rejects an unknown language', async () => {
    expect((await validateStart({ ...validStart, language: 'fr' }, registry)).ok).toBe(false);
  });

  it.each([null, 'start', 42, {}, { type: 'hint' }, { ...validStart, provider: undefined }, { ...validStart, translationModel: 5 }])(
    'rejects malformed input %j',
    async (input) => {
      expect((await validateStart(input, registry)).ok).toBe(false);
    },
  );

  it('rejects context fields that are not text', async () => {
    expect((await validateStart({ ...validStart, callContext: 5 }, registry)).ok).toBe(false);
    expect((await validateStart({ ...validStart, profile: {} }, registry)).ok).toBe(false);
  });

  it('treats missing context fields as empty text', async () => {
    const { callContext: _c, profile: _p, ...partial } = validStart;

    const result = await validateStart(partial, registry);

    expect(result).toMatchObject({ ok: true, start: { callContext: '', profile: '' } });
  });
});
