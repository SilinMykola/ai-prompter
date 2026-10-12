// Picks usable chat models out of a provider's model list and chooses sensible defaults.
// Pure functions: the lists come from the providers, nothing here talks to the network.

/** The shape of one entry from the Gemini models.list call (only the fields we read). */
export interface GeminiModelInfo {
  name?: string;
  supportedActions?: string[];
}

// Models of these kinds also support "generateContent" but are not text chat models.
const GEMINI_DENY =
  /tts|image|lyria|robotics|computer-use|transcribe|omni|embedding|live|audio|nano-banana|deep-research|antigravity|customtools|gemma/;

/** Gemini chat models, with the "models/" prefix removed. API order is kept. */
export function filterGeminiModels(items: GeminiModelInfo[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const id = item.name?.replace(/^models\//, '');
    if (!id || !id.startsWith('gemini-')) continue;
    if (!item.supportedActions?.includes('generateContent')) continue;
    if (GEMINI_DENY.test(id)) continue;
    ids.push(id);
  }
  return ids;
}

export function filterClaudeModels(ids: string[]): string[] {
  return ids.filter((id) => id.startsWith('claude-'));
}

/** "gemini-3.5-flash-lite" -> [3, 5]; "claude-haiku-4-5-20251001" -> [4, 5, 20251001]. */
function versionOf(id: string): number[] {
  return (id.match(/\d+/g) ?? []).map(Number);
}

/** Compares version arrays number by number (so 3.10 is newer than 3.9). */
function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? -1) - (b[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Newest model: highest version; on a tie the non-preview one; then by name, for a stable result. */
function newest(ids: string[]): string {
  return [...ids].sort((a, b) => {
    const byVersion = compareVersions(versionOf(b), versionOf(a));
    if (byVersion !== 0) return byVersion;
    const byPreview = Number(a.includes('preview')) - Number(b.includes('preview'));
    return byPreview !== 0 ? byPreview : a.localeCompare(b);
  })[0];
}

/** Newest model matching the first pattern that matches anything; else the newest overall. */
function newestMatching(ids: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const matching = ids.filter((id) => pattern.test(id));
    if (matching.length > 0) return newest(matching);
  }
  return newest(ids);
}

export interface DefaultModels {
  /** Fast and cheap: used to translate every sentence. */
  translation: string;
  /** Stronger: used for reply hints. */
  hint: string;
}

export function pickDefaults(ids: string[]): DefaultModels {
  if (ids.length === 0) throw new Error('Cannot pick default models from an empty list');
  return {
    translation: newestMatching(ids, [/flash-lite|haiku/, /flash/]),
    hint: newestMatching(ids, [/pro|sonnet/]),
  };
}
