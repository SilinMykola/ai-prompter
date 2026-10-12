import { describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '@ai-prompter/shared/protocol';
import type { AppConfig } from '../config';
import { LlmError } from './errors';
import { createRegistry } from './index';
import type { LlmProvider } from './types';

const MINUTE = 60_000;

/** A fake provider whose model list is controlled by the test. */
function fakeProvider(id: ProviderId, listModels: () => Promise<string[]>): LlmProvider {
  return { id, label: id === 'gemini' ? 'Gemini' : 'Claude', listModels: vi.fn(listModels), stream: () => (async function* () {})() };
}

function makeConfig(parts: Partial<AppConfig['providers']>, defaultProvider: ProviderId = 'gemini'): AppConfig {
  return {
    port: 8787,
    deepgram: { apiKey: 'dg-secret', model: 'nova-3' },
    providers: parts,
    defaultProvider,
    warnings: [],
  };
}

// A clock the test can move forward.
function fakeClock() {
  let now = 1_000_000;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

function setup(options: {
  config?: AppConfig;
  geminiModels?: () => Promise<string[]>;
  claudeModels?: () => Promise<string[]>;
}) {
  const clock = fakeClock();
  const log = vi.fn();
  const gemini = fakeProvider('gemini', options.geminiModels ?? (async () => ['gemini-3.5-flash-lite', 'gemini-3.1-pro-preview']));
  const claude = fakeProvider('anthropic', options.claudeModels ?? (async () => ['claude-haiku-5-5', 'claude-sonnet-5-5']));
  const factories = {
    gemini: vi.fn(() => gemini),
    anthropic: vi.fn(() => claude),
  };
  const config = options.config ?? makeConfig({ gemini: { apiKey: 'gem-secret' }, anthropic: { apiKey: 'ant-secret' } });
  const registry = createRegistry(config, factories, { now: clock.now, log });
  return { registry, clock, log, gemini, claude, factories };
}

describe('available providers', () => {
  it('contains only providers that have a key', async () => {
    const { registry, factories } = setup({ config: makeConfig({ gemini: { apiKey: 'gem-secret' } }) });

    expect((await registry.getConfig()).providers.map((p) => p.id)).toEqual(['gemini']);
    expect(registry.get('anthropic')).toBeUndefined();
    expect(registry.get('gemini')).toBeDefined();
    expect(factories.anthropic).not.toHaveBeenCalled();
  });

  it('reports the default provider from the configuration', async () => {
    const { registry } = setup({ config: makeConfig({ gemini: { apiKey: 'g' }, anthropic: { apiKey: 'a' } }, 'anthropic') });

    expect((await registry.getConfig()).defaultProvider).toBe('anthropic');
  });

  it('never exposes keys in the public config', async () => {
    const { registry } = setup({});

    const text = JSON.stringify(await registry.getConfig());

    expect(text).not.toContain('gem-secret');
    expect(text).not.toContain('ant-secret');
    expect(text).not.toContain('dg-secret');
  });
});

describe('models and defaults', () => {
  it('uses the models and defaults found through the API', async () => {
    const { registry } = setup({});

    const [gemini, claude] = (await registry.getConfig()).providers;

    expect(gemini).toMatchObject({
      id: 'gemini',
      label: 'Gemini',
      models: ['gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'],
      defaultTranslationModel: 'gemini-3.5-flash-lite',
      defaultHintModel: 'gemini-3.1-pro-preview',
    });
    expect(claude).toMatchObject({ defaultTranslationModel: 'claude-haiku-5-5', defaultHintModel: 'claude-sonnet-5-5' });
  });

  it('uses an override list as is, without calling the API', async () => {
    const config = makeConfig({ gemini: { apiKey: 'g', modelOverride: ['fast-1', 'strong-1', 'extra'] } });
    const { registry, gemini } = setup({ config });

    const [info] = (await registry.getConfig()).providers;

    expect(info.models).toEqual(['fast-1', 'strong-1', 'extra']);
    expect(info.defaultTranslationModel).toBe('fast-1');
    expect(info.defaultHintModel).toBe('strong-1');
    expect(gemini.listModels).not.toHaveBeenCalled();
  });

  it('uses the single override model for both roles', async () => {
    const config = makeConfig({ gemini: { apiKey: 'g', modelOverride: ['only'] } });
    const { registry } = setup({ config });

    const [info] = (await registry.getConfig()).providers;

    expect(info.defaultTranslationModel).toBe('only');
    expect(info.defaultHintModel).toBe('only');
  });

  it('falls back to built-in models when listing fails, and logs without secrets', async () => {
    const { registry, log } = setup({
      geminiModels: async () => {
        throw new LlmError('auth', 'gemini request failed: HTTP 401', 401);
      },
    });

    const [info] = (await registry.getConfig()).providers;

    expect(info.models.length).toBeGreaterThan(0);
    expect(info.models).toContain(info.defaultTranslationModel);
    expect(info.models).toContain(info.defaultHintModel);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('gemini'));
    expect(JSON.stringify(log.mock.calls)).not.toContain('gem-secret');
  });

  it('falls back when the list is empty', async () => {
    const { registry } = setup({ geminiModels: async () => [] });

    expect((await registry.getConfig()).providers[0].models.length).toBeGreaterThan(0);
  });

  it('always offers defaults that are members of the model list', async () => {
    const lists = [['x-1'], ['gemini-2.5-flash', 'gemini-3.5-flash'], ['a-pro', 'b-lite', 'c']];
    for (const list of lists) {
      const { registry } = setup({ geminiModels: async () => list });
      const [info] = (await registry.getConfig()).providers;

      expect(info.models).toContain(info.defaultTranslationModel);
      expect(info.models).toContain(info.defaultHintModel);
    }
  });
});

describe('caching', () => {
  it('asks the API once within ten minutes', async () => {
    const { registry, clock, gemini } = setup({});

    await registry.getConfig();
    clock.advance(9 * MINUTE);
    await registry.getConfig();

    expect(gemini.listModels).toHaveBeenCalledTimes(1);
  });

  it('asks again after ten minutes', async () => {
    const { registry, clock, gemini } = setup({});

    await registry.getConfig();
    clock.advance(11 * MINUTE);
    await registry.getConfig();

    expect(gemini.listModels).toHaveBeenCalledTimes(2);
  });

  it('shares one request between simultaneous callers', async () => {
    const { registry, gemini } = setup({});

    await Promise.all([registry.getConfig(), registry.getConfig()]);

    expect(gemini.listModels).toHaveBeenCalledTimes(1);
  });

  it('does not hammer a failing API, but tries again after a minute', async () => {
    let healthy = false;
    const { registry, clock, gemini } = setup({
      geminiModels: async () => {
        if (!healthy) throw new LlmError('other', 'gemini request failed: HTTP 500', 500);
        return ['gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'];
      },
    });

    await registry.getConfig();
    clock.advance(30_000);
    await registry.getConfig();
    expect(gemini.listModels).toHaveBeenCalledTimes(1);

    healthy = true;
    clock.advance(31_000);
    const [info] = (await registry.getConfig()).providers;
    expect(gemini.listModels).toHaveBeenCalledTimes(2);
    expect(info.defaultHintModel).toBe('gemini-3.1-pro-preview');
  });

  it('keeps serving the last good list when a refresh fails', async () => {
    let healthy = true;
    const { registry, clock } = setup({
      geminiModels: async () => {
        if (!healthy) throw new LlmError('rate_limit', 'gemini request failed: HTTP 429', 429);
        return ['gemini-3.9-flash-lite', 'gemini-3.9-pro'];
      },
    });
    await registry.getConfig();

    healthy = false;
    clock.advance(11 * MINUTE);
    const [info] = (await registry.getConfig()).providers;

    expect(info.models).toEqual(['gemini-3.9-flash-lite', 'gemini-3.9-pro']);
  });
});

