import { describe, expect, it } from 'vitest';
import { filterClaudeModels, filterGeminiModels, pickDefaults } from './models';

// A trimmed copy of what the real Gemini models.list returned: chat models mixed with
// text-to-speech, image, music, agent, research and robotics models.
const generate = ['generateContent'];
const geminiList = [
  { name: 'models/gemini-2.5-flash', supportedActions: generate },
  { name: 'models/gemini-2.5-pro', supportedActions: generate },
  { name: 'models/gemini-2.5-flash-preview-tts', supportedActions: generate },
  { name: 'models/gemma-4-26b-a4b-it', supportedActions: generate },
  { name: 'models/gemini-flash-latest', supportedActions: generate },
  { name: 'models/gemini-flash-lite-latest', supportedActions: generate },
  { name: 'models/gemini-2.5-flash-lite', supportedActions: generate },
  { name: 'models/gemini-2.5-flash-image', supportedActions: generate },
  { name: 'models/gemini-3.1-pro-preview', supportedActions: generate },
  { name: 'models/gemini-3.1-pro-preview-customtools', supportedActions: generate },
  { name: 'models/gemini-3.1-flash-lite-preview', supportedActions: generate },
  { name: 'models/gemini-3.1-flash-lite', supportedActions: generate },
  { name: 'models/gemini-3.1-flash-lite-image', supportedActions: generate },
  { name: 'models/gemini-nano-banana-2.1', supportedActions: generate },
  { name: 'models/gemini-3.5-flash', supportedActions: generate },
  { name: 'models/gemini-3.5-flash-lite', supportedActions: generate },
  { name: 'models/gemini-omni-flash-preview', supportedActions: generate },
  { name: 'models/gemini-3.5-transcribe', supportedActions: generate },
  { name: 'models/lyria-3-clip-preview', supportedActions: generate },
  { name: 'models/gemini-robotics-er-2-preview', supportedActions: generate },
  { name: 'models/gemini-2.5-computer-use-preview-10-2025', supportedActions: generate },
  { name: 'models/antigravity-preview-05-2026', supportedActions: generate },
  { name: 'models/deep-research-pro-preview-12-2025', supportedActions: generate },
  { name: 'models/gemini-embedding-001', supportedActions: ['embedContent'] },
];

describe('filterGeminiModels', () => {
  it('keeps only chat models and strips the "models/" prefix', () => {
    expect(filterGeminiModels(geminiList)).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-2.5-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('drops models that cannot generate content', () => {
    expect(filterGeminiModels([{ name: 'models/gemini-embedding-001', supportedActions: ['embedContent'] }])).toEqual([]);
  });

  it('handles missing names and actions without crashing', () => {
    expect(filterGeminiModels([{}, { name: 'models/gemini-3.5-flash' }])).toEqual([]);
  });
});

describe('filterClaudeModels', () => {
  it('keeps claude ids only', () => {
    expect(filterClaudeModels(['claude-sonnet-5-5', 'something-else', 'claude-haiku-5-5'])).toEqual([
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
  });
});

describe('pickDefaults', () => {
  it('picks the newest flash-lite for translation and the newest pro for hints (Gemini)', () => {
    expect(pickDefaults(filterGeminiModels(geminiList))).toEqual({
      translation: 'gemini-3.5-flash-lite',
      hint: 'gemini-3.1-pro-preview',
    });
  });

  it('picks haiku and sonnet for Claude', () => {
    const defaults = pickDefaults(['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']);

    expect(defaults).toEqual({ translation: 'claude-haiku-5-5', hint: 'claude-sonnet-5-5' });
  });

  it('compares versions as numbers, not as text', () => {
    // As text "3.10" < "3.9"; as numbers 3.10 is newer.
    expect(pickDefaults(['gemini-3.9-flash-lite', 'gemini-3.10-flash-lite', 'gemini-3.9-pro']).translation).toBe(
      'gemini-3.10-flash-lite',
    );
  });

  it('prefers the stable id over the preview id of the same version', () => {
    expect(pickDefaults(['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite']).translation).toBe(
      'gemini-3.1-flash-lite',
    );
  });

  it('falls back to flash, then to the newest model, when there is no lite/pro', () => {
    expect(pickDefaults(['gemini-2.5-flash', 'gemini-3.5-flash']).translation).toBe('gemini-3.5-flash');
    expect(pickDefaults(['gemini-3.5-flash', 'other-1']).hint).toBe('gemini-3.5-flash');
  });

  it('works with a single model', () => {
    expect(pickDefaults(['only-one'])).toEqual({ translation: 'only-one', hint: 'only-one' });
  });

  it('throws on an empty list', () => {
    expect(() => pickDefaults([])).toThrow();
  });
});
