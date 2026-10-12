import type { ProviderId } from '@ai-prompter/shared/protocol';

// Reads the settings from environment variables (loaded from .env by index.ts).
// `loadConfig` takes the environment as an argument instead of reading `process.env`
// itself, so tests can pass any set of variables.

export interface ProviderConfig {
  apiKey: string;
  /** From GEMINI_MODELS / ANTHROPIC_MODELS. When present, these are the only models offered. */
  modelOverride?: string[];
}

export interface AppConfig {
  port: number;
  deepgram: { apiKey: string; model: string };
  /** Only providers that have an API key are present. */
  providers: Partial<Record<ProviderId, ProviderConfig>>;
  defaultProvider: ProviderId;
  /** Problems that do not stop the server but are worth a log line. They never contain secrets. */
  warnings: string[];
}

/** The server cannot start with this environment. The message says what to fix. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

const DEFAULT_PORT = 8787;
// Order matters: when no default is configured, the first available one wins.
const PROVIDER_ORDER: ProviderId[] = ['gemini', 'anthropic'];
const KEY_VARIABLES: Record<ProviderId, string> = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const MODEL_VARIABLES: Record<ProviderId, string> = { gemini: 'GEMINI_MODELS', anthropic: 'ANTHROPIC_MODELS' };

/** A variable that is missing, empty or only spaces counts as "not set". */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseModelList(value: string | undefined): string[] | undefined {
  const models = (value ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return models.length > 0 ? [...new Set(models)] : undefined; // Set removes duplicates, keeping order
}

function parsePort(value: string | undefined, warnings: string[]): number {
  if (!value?.trim()) return DEFAULT_PORT; // empty means "use the default", no warning needed
  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  warnings.push(`PORT=${value} is not a valid port (1-65535); using ${DEFAULT_PORT}.`);
  return DEFAULT_PORT;
}

export function loadConfig(env: Env): AppConfig {
  const warnings: string[] = [];

  const deepgramKey = read(env, 'DEEPGRAM_API_KEY');
  if (!deepgramKey) {
    throw new ConfigError('DEEPGRAM_API_KEY is not set. Add it to the .env file (see .env.example).');
  }

  const providers: AppConfig['providers'] = {};
  for (const id of PROVIDER_ORDER) {
    const apiKey = read(env, KEY_VARIABLES[id]);
    if (apiKey) providers[id] = { apiKey, modelOverride: parseModelList(env[MODEL_VARIABLES[id]]) };
  }

  const available = PROVIDER_ORDER.filter((id) => providers[id]);
  if (available.length === 0) {
    throw new ConfigError(
      'No LLM provider is configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in the .env file (see .env.example).',
    );
  }

  const wanted = read(env, 'LLM_PROVIDER')?.toLowerCase();
  let defaultProvider = available[0];
  if (wanted) {
    if (available.includes(wanted as ProviderId)) {
      defaultProvider = wanted as ProviderId;
    } else {
      warnings.push(`LLM_PROVIDER=${wanted} is not available (unknown or no API key); using ${defaultProvider}.`);
    }
  }

  return {
    port: parsePort(env.PORT, warnings),
    deepgram: { apiKey: deepgramKey, model: read(env, 'DEEPGRAM_MODEL') ?? 'nova-3' },
    providers,
    defaultProvider,
    warnings,
  };
}
