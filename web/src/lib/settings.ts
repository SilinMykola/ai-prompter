import type { ApiConfig, Language, ProviderId, ProviderInfo, TargetLanguage } from '@ai-prompter/shared/protocol';

// The choices a user makes on the setup screen, and what is remembered between visits.

export type AudioSource = 'tab' | 'mic';

export interface Settings {
  audioSource: AudioSource;
  language: Language;
  /** What the other person's sentences are translated into. */
  targetLanguage: TargetLanguage;
  provider: ProviderId;
  translationModel: string;
  hintModel: string;
  /** Who is calling and why. Never stored anywhere. */
  callContext: string;
  /** "My data": name, profession... Remembered in this browser only. */
  profile: string;
  /** Developer mode: ask the server for a full log of the call. Never remembered. */
  devLog: boolean;
}

/** The two methods of `localStorage` that we use (so tests can pass a fake one). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'ai-prompter.settings';

const AUDIO_SOURCES: AudioSource[] = ['tab', 'mic'];
const LANGUAGES: Language[] = ['de', 'en', 'multi'];
const TARGET_LANGUAGES: TargetLanguage[] = ['ru', 'uk', 'de', 'en'];

function providerInfo(config: ApiConfig, id: ProviderId): ProviderInfo {
  return config.providers.find((p) => p.id === id) ?? config.providers.find((p) => p.id === config.defaultProvider)!;
}

/** Reads the remembered values. Anything unreadable or of the wrong type is simply left out. */
function readStored(storage: StorageLike | undefined): Record<string, unknown> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {}; // storage blocked, or not valid JSON
  }
}

/**
 * Combines the server's defaults with what was remembered. A remembered provider or model
 * that is no longer offered is replaced by the default without a word to the user.
 */
export function resolveSettings(config: ApiConfig, storage: StorageLike | undefined): Settings {
  const stored = readStored(storage);

  const wantedProvider = config.providers.find((p) => p.id === stored.provider);
  const provider = wantedProvider ?? providerInfo(config, config.defaultProvider);

  const pickModel = (value: unknown, fallback: string) =>
    typeof value === 'string' && provider.models.includes(value) ? value : fallback;

  return {
    audioSource: AUDIO_SOURCES.includes(stored.audioSource as AudioSource) ? (stored.audioSource as AudioSource) : 'tab',
    language: LANGUAGES.includes(stored.language as Language) ? (stored.language as Language) : 'de',
    targetLanguage: TARGET_LANGUAGES.includes(stored.targetLanguage as TargetLanguage) ? (stored.targetLanguage as TargetLanguage) : 'ru',
    provider: provider.id,
    translationModel: pickModel(stored.translationModel, provider.defaultTranslationModel),
    hintModel: pickModel(stored.hintModel, provider.defaultHintModel),
    callContext: '',
    profile: typeof stored.profile === 'string' ? stored.profile : '',
    devLog: false,
  };
}

/** Remembers the settings (without the call context). Failures are ignored on purpose. */
export function saveSettings(settings: Settings, storage: StorageLike | undefined): void {
  try {
    storage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        audioSource: settings.audioSource,
        language: settings.language,
        targetLanguage: settings.targetLanguage,
        provider: settings.provider,
        translationModel: settings.translationModel,
        hintModel: settings.hintModel,
        profile: settings.profile,
      }),
    );
  } catch {
    // storage full or blocked: the app works the same, it just will not remember
  }
}

/** Switching provider also switches both models to that provider's defaults. */
export function changeProvider(settings: Settings, config: ApiConfig, provider: ProviderId): Settings {
  const info = config.providers.find((p) => p.id === provider);
  if (!info) return settings;
  return {
    ...settings,
    provider: info.id,
    translationModel: info.defaultTranslationModel,
    hintModel: info.defaultHintModel,
  };
}
