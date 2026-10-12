import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

// A minimal valid environment; each test overrides or removes what it needs.
const base = { DEEPGRAM_API_KEY: 'dg', GEMINI_API_KEY: 'gm' };

describe('required keys', () => {
  it('fails without the Deepgram key and names the variable', () => {
    expect(() => loadConfig({ GEMINI_API_KEY: 'gm' })).toThrow(ConfigError);
    expect(() => loadConfig({ GEMINI_API_KEY: 'gm' })).toThrow(/DEEPGRAM_API_KEY/);
  });

  it('fails without any LLM key and names both variables', () => {
    const attempt = () => loadConfig({ DEEPGRAM_API_KEY: 'dg' });

    expect(attempt).toThrow(/GEMINI_API_KEY/);
    expect(attempt).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('is happy with only one LLM key', () => {
    const config = loadConfig(base);

    expect(Object.keys(config.providers)).toEqual(['gemini']);
  });

  it('treats empty and whitespace-only values as missing', () => {
    const config = loadConfig({ ...base, ANTHROPIC_API_KEY: '   ' });
    expect(config.providers.anthropic).toBeUndefined();

    expect(() => loadConfig({ ...base, DEEPGRAM_API_KEY: '' })).toThrow(/DEEPGRAM_API_KEY/);
  });

  it('never puts a key value into an error message', () => {
    try {
      loadConfig({ GEMINI_API_KEY: 'super-secret-value' });
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value');
    }
  });
});

describe('default provider', () => {
  it('uses LLM_PROVIDER when that provider has a key', () => {
    const config = loadConfig({ ...base, ANTHROPIC_API_KEY: 'an', LLM_PROVIDER: 'anthropic' });

    expect(config.defaultProvider).toBe('anthropic');
    expect(config.warnings).toEqual([]);
  });

  it('falls back to the first available provider with a warning', () => {
    const config = loadConfig({ ...base, LLM_PROVIDER: 'anthropic' });

    expect(config.defaultProvider).toBe('gemini');
    expect(config.warnings).toHaveLength(1);
    expect(config.warnings[0]).toMatch(/LLM_PROVIDER/);
  });

  it('prefers Gemini when LLM_PROVIDER is not set', () => {
    const config = loadConfig({ ...base, ANTHROPIC_API_KEY: 'an' });

    expect(config.defaultProvider).toBe('gemini');
  });

  it('ignores an unknown LLM_PROVIDER value with a warning', () => {
    const config = loadConfig({ ...base, LLM_PROVIDER: 'openai' });

    expect(config.defaultProvider).toBe('gemini');
    expect(config.warnings).toHaveLength(1);
  });
});

describe('model overrides', () => {
  it('splits a comma-separated list and trims spaces', () => {
    const config = loadConfig({ ...base, GEMINI_MODELS: ' a , b ' });

    expect(config.providers.gemini?.modelOverride).toEqual(['a', 'b']);
  });

  it('means "no override" when empty or missing', () => {
    expect(loadConfig({ ...base, GEMINI_MODELS: '' }).providers.gemini?.modelOverride).toBeUndefined();
    expect(loadConfig(base).providers.gemini?.modelOverride).toBeUndefined();
  });

  it('ignores empty items such as a trailing comma', () => {
    const config = loadConfig({ ...base, GEMINI_MODELS: 'a,,b,' });

    expect(config.providers.gemini?.modelOverride).toEqual(['a', 'b']);
  });
});

describe('input hygiene', () => {
  it('matches LLM_PROVIDER ignoring case and spaces', () => {
    const config = loadConfig({ ...base, ANTHROPIC_API_KEY: 'an', LLM_PROVIDER: ' Anthropic ' });

    expect(config.defaultProvider).toBe('anthropic');
    expect(config.warnings).toEqual([]);
  });

  it('removes duplicate models from an override list', () => {
    expect(loadConfig({ ...base, GEMINI_MODELS: 'a,b,a' }).providers.gemini?.modelOverride).toEqual(['a', 'b']);
  });

  it('warns about a PORT that is set but unusable, and still uses 8787', () => {
    for (const port of ['70000', '8o80']) {
      const config = loadConfig({ ...base, PORT: port });

      expect(config.port).toBe(8787);
      expect(config.warnings.join(' ')).toMatch(/PORT/);
    }
  });

  it('does not warn about an empty PORT', () => {
    expect(loadConfig({ ...base, PORT: '' }).warnings).toEqual([]);
  });
});

describe('ports and Deepgram model', () => {
  it('defaults the port to 8787', () => {
    expect(loadConfig(base).port).toBe(8787);
  });

  it.each(['', '  ', 'abc', '0', '-5', '1.5'])('uses 8787 for the invalid PORT %j', (port) => {
    expect(loadConfig({ ...base, PORT: port }).port).toBe(8787);
  });

  it('reads a valid PORT', () => {
    expect(loadConfig({ ...base, PORT: '9000' }).port).toBe(9000);
  });

  it('defaults the Deepgram model to nova-3', () => {
    expect(loadConfig(base).deepgram.model).toBe('nova-3');
    expect(loadConfig({ ...base, DEEPGRAM_MODEL: 'nova-2' }).deepgram.model).toBe('nova-2');
  });
});
