import { describe, expect, it } from 'vitest';
import type { ApiConfig } from '@ai-prompter/shared/protocol';
import { changeProvider, resolveSettings, saveSettings, type StorageLike } from './settings';

const config: ApiConfig = {
  defaultProvider: 'gemini',
  providers: [
    { id: 'gemini', label: 'Gemini', models: ['g-fast', 'g-mid', 'g-strong'], defaultTranslationModel: 'g-fast', defaultHintModel: 'g-strong' },
    { id: 'anthropic', label: 'Claude', models: ['c-fast', 'c-strong'], defaultTranslationModel: 'c-fast', defaultHintModel: 'c-strong' },
  ],
};
const geminiOnly: ApiConfig = { ...config, providers: [config.providers[0]] };

/** A storage kept in a Map, standing in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
  return { storage, data };
}

const KEY = 'ai-prompter.settings';

describe('target language', () => {
  it('is remembered and restored; an unknown value falls back to Russian', () => {
    const remembered = memoryStorage({ [KEY]: JSON.stringify({ targetLanguage: 'de' }) });
    expect(resolveSettings(config, remembered.storage).targetLanguage).toBe('de');

    const broken = memoryStorage({ [KEY]: JSON.stringify({ targetLanguage: 'fr' }) });
    expect(resolveSettings(config, broken.storage).targetLanguage).toBe('ru');
  });
});

describe('default settings', () => {
  it('are used on a first visit', () => {
    expect(resolveSettings(config, memoryStorage().storage)).toEqual({
      audioSource: 'tab',
      language: 'de',
      targetLanguage: 'ru',
      provider: 'gemini',
      translationModel: 'g-fast',
      hintModel: 'g-strong',
      callContext: '',
      profile: '',
    });
  });

  it('are used when there is no storage at all', () => {
    expect(resolveSettings(config, undefined).provider).toBe('gemini');
  });
});

describe('remembered settings', () => {
  it('are restored', () => {
    const { storage } = memoryStorage({
      [KEY]: JSON.stringify({
        audioSource: 'mic',
        language: 'multi',
        provider: 'anthropic',
        translationModel: 'c-strong',
        hintModel: 'c-fast',
        profile: 'Name: Test',
      }),
    });

    expect(resolveSettings(config, storage)).toEqual({
      audioSource: 'mic',
      language: 'multi',
      targetLanguage: 'ru',
      provider: 'anthropic',
      translationModel: 'c-strong',
      hintModel: 'c-fast',
      callContext: '',
      profile: 'Name: Test',
    });
  });

  it('are saved without the call context', () => {
    const { storage, data } = memoryStorage();
    const settings = { ...resolveSettings(config, storage), callContext: 'Arzttermin', profile: 'Mein Profil' };

    saveSettings(settings, storage);

    const saved = JSON.parse(data.get(KEY)!);
    expect(saved).toEqual({
      audioSource: 'tab',
      language: 'de',
      targetLanguage: 'ru',
      provider: 'gemini',
      translationModel: 'g-fast',
      hintModel: 'g-strong',
      profile: 'Mein Profil',
    });
    expect(data.get(KEY)).not.toContain('Arzttermin');
  });

  it('never restore a call context, even if one somehow got stored', () => {
    const { storage } = memoryStorage({ [KEY]: JSON.stringify({ callContext: 'old secret' }) });

    expect(resolveSettings(config, storage).callContext).toBe('');
  });
});

describe('stale choices', () => {
  it('replace a provider that is gone, with that provider\'s defaults, silently', () => {
    const { storage } = memoryStorage({
      [KEY]: JSON.stringify({ provider: 'anthropic', translationModel: 'c-strong', hintModel: 'c-fast' }),
    });

    const settings = resolveSettings(geminiOnly, storage);

    expect(settings).toMatchObject({ provider: 'gemini', translationModel: 'g-fast', hintModel: 'g-strong' });
  });

  it('replace only the model that is gone', () => {
    const { storage } = memoryStorage({
      [KEY]: JSON.stringify({ provider: 'gemini', translationModel: 'g-mid', hintModel: 'old-model', language: 'en' }),
    });

    const settings = resolveSettings(config, storage);

    expect(settings).toMatchObject({ translationModel: 'g-mid', hintModel: 'g-strong', language: 'en' });
  });
});

describe('changing the provider', () => {
  it('resets both models to the new provider\'s defaults', () => {
    const settings = { ...resolveSettings(config, memoryStorage().storage), translationModel: 'g-mid' };

    const changed = changeProvider(settings, config, 'anthropic');

    expect(changed).toMatchObject({ provider: 'anthropic', translationModel: 'c-fast', hintModel: 'c-strong' });
    expect(changed.language).toBe(settings.language);
  });

  it('leaves the settings alone for an unknown provider', () => {
    const settings = resolveSettings(config, memoryStorage().storage);

    expect(changeProvider(settings, config, 'nope' as never)).toEqual(settings);
  });
});

describe('broken storage', () => {
  it('uses defaults when reading throws', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    };

    expect(resolveSettings(config, storage).provider).toBe('gemini');
  });

  it.each(['not json', 'null', '42', '[]', '"text"'])('uses defaults for invalid data %j', (value) => {
    const { storage } = memoryStorage({ [KEY]: value });

    expect(resolveSettings(config, storage)).toEqual(resolveSettings(config, memoryStorage().storage));
  });

  it('ignores fields with the wrong type, one by one', () => {
    const { storage } = memoryStorage({
      [KEY]: JSON.stringify({ audioSource: 5, language: 'fr', provider: 'gemini', translationModel: 'g-mid', hintModel: {}, profile: 7 }),
    });

    expect(resolveSettings(config, storage)).toMatchObject({
      audioSource: 'tab',
      language: 'de',
      translationModel: 'g-mid', // the valid parts survive
      hintModel: 'g-strong',
      profile: '',
    });
  });

  it('does not fail when saving throws', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };

    expect(() => saveSettings(resolveSettings(config, storage), storage)).not.toThrow();
    expect(() => saveSettings(resolveSettings(config, undefined), undefined)).not.toThrow();
  });
});
