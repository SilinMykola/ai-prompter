import type { ApiConfig, ProviderId, ProviderInfo } from '@ai-prompter/shared/protocol';
import type { AppConfig } from '../config';
import { pickDefaults } from './models';
import type { LlmProvider } from './types';

// The registry knows which providers are available (have an API key), what models each
// offers, and which ones to preselect. The rest of the server asks it and never needs to
// know whether the answer came from the Gemini or the Claude API.

const MODELS_TTL_MS = 10 * 60_000; // how long a fetched model list is reused
const FAILURE_TTL_MS = 60_000; // after a failed fetch, do not try again for a minute

// Used when the provider's API cannot be asked. These are the newest ids known at the time of writing.
const FALLBACK_MODELS: Record<ProviderId, string[]> = {
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
};

// Display order of providers: Gemini first (matches how the default is chosen).
const PROVIDER_ORDER: ProviderId[] = ['gemini', 'anthropic'];

export type ProviderFactories = Record<ProviderId, (apiKey: string) => LlmProvider>;

export interface Registry {
  /** The provider, or undefined if it has no API key. */
  get(id: ProviderId): LlmProvider | undefined;
  /** Models of an available provider (empty for an unavailable one). */
  modelsOf(id: ProviderId): Promise<string[]>;
  /** What GET /api/config returns. */
  getConfig(): Promise<ApiConfig>;
}

interface ModelsEntry {
  models: string[];
  expiresAt: number;
}

export function createRegistry(
  config: AppConfig,
  factories: ProviderFactories,
  deps: { now?: () => number; log?: (message: string) => void } = {},
): Registry {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.warn(message));

  // Only providers with a key are built at all.
  const providers = new Map<ProviderId, LlmProvider>();
  for (const id of PROVIDER_ORDER) {
    const providerConfig = config.providers[id];
    if (providerConfig) providers.set(id, factories[id](providerConfig.apiKey));
  }

  // The last list that was fetched successfully; served again if a later refresh fails.
  const lastGood = new Map<ProviderId, string[]>();

  // The cache stores the *promise*, so simultaneous callers share one request.
  const cache = new Map<ProviderId, { entry: Promise<ModelsEntry> }>();

  async function fetchModels(id: ProviderId): Promise<ModelsEntry> {
    const override = config.providers[id]?.modelOverride;
    if (override) return { models: override, expiresAt: Infinity };

    try {
      const models = await providers.get(id)!.listModels();
      if (models.length > 0) {
        lastGood.set(id, models);
        return { models, expiresAt: now() + MODELS_TTL_MS };
      }
      log(`${id}: the API returned no usable models`);
    } catch (error) {
      // LlmError messages contain the provider and HTTP status only, never keys.
      log(`${id}: could not list models (${error instanceof Error ? error.message : 'unknown error'})`);
    }
    // Prefer the last good list over the built-in ids, and try again in a minute.
    return { models: lastGood.get(id) ?? FALLBACK_MODELS[id], expiresAt: now() + FAILURE_TTL_MS };
  }

  async function modelsOf(id: ProviderId): Promise<string[]> {
    if (!providers.has(id)) return [];
    const cached = cache.get(id);
    if (cached) {
      const entry = await cached.entry;
      if (entry.expiresAt > now()) return entry.models;
    }
    const entry = fetchModels(id);
    cache.set(id, { entry });
    return (await entry).models;
  }

  async function infoFor(id: ProviderId, provider: LlmProvider): Promise<ProviderInfo> {
    const models = await modelsOf(id);
    const override = config.providers[id]?.modelOverride;
    // An override list means "first = fast, second = strong"; otherwise pick by model name.
    const defaults = override
      ? { translation: override[0], hint: override[1] ?? override[0] }
      : pickDefaults(models);
    return {
      id,
      label: provider.label,
      models,
      defaultTranslationModel: defaults.translation,
      defaultHintModel: defaults.hint,
    };
  }

  async function getConfig(): Promise<ApiConfig> {
    const infos = await Promise.all([...providers].map(([id, provider]) => infoFor(id, provider)));
    return { defaultProvider: config.defaultProvider, providers: infos };
  }

  return { get: (id) => providers.get(id), modelsOf, getConfig };
}
