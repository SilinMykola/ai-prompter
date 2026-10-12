import { isAbortError, toLlmError } from './errors';
import { filterGeminiModels, type GeminiModelInfo } from './models';
import type { LlmProvider, LlmRequest } from './types';

// The parts of the `@google/genai` client that we use. Declaring only these makes it easy
// to pass a fake client in tests; the real `GoogleGenAI` object has these methods too.
export interface GeminiClient {
  models: {
    list(params?: { config?: { pageSize?: number } }): Promise<AsyncIterable<GeminiModelInfo>>;
    generateContentStream(params: {
      model: string;
      contents: string;
      config?: {
        systemInstruction?: string;
        maxOutputTokens?: number;
        temperature?: number;
        abortSignal?: AbortSignal;
        thinkingConfig?: { thinkingLevel: string };
      };
    }): Promise<AsyncIterable<{ text?: string }>>;
  };
}

// "Thinking" tokens are spent before the first word and count against the token limit, so fast
// answers ask for as little as possible. Models differ in what they accept (some refuse MINIMAL),
// hence a ladder: the least thinking first, "no setting at all" last.
const THINKING_LEVELS = ['MINIMAL', 'LOW', undefined] as const;

export function createGeminiProvider({ client }: { client: GeminiClient }): LlmProvider {
  // For each model, the first rung of the ladder worth trying (a model that refused MINIMAL
  // and accepted LOW starts at LOW next time).
  const startLevel = new Map<string, number>();

  // One call to the service. Yields the text pieces as they arrive.
  async function* generate(req: LlmRequest, level: (typeof THINKING_LEVELS)[number]): AsyncGenerator<string> {
    const pieces = await client.models.generateContentStream({
      model: req.model,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens,
        temperature: req.temperature,
        abortSignal: req.signal,
        ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
      },
    });
    for await (const piece of pieces) {
      if (req.signal?.aborted) return;
      if (piece.text) yield piece.text;
    }
  }

  async function* stream(req: LlmRequest): AsyncGenerator<string> {
    // Only fast requests use the ladder; others leave thinking to the model.
    const firstRung = req.lowLatency ? (startLevel.get(req.model) ?? 0) : THINKING_LEVELS.length - 1;

    for (let rung = firstRung; ; rung++) {
      let received = false;
      try {
        for await (const text of generate(req, THINKING_LEVELS[rung])) {
          // Text arrived at a lower rung than we started at: remember it, the higher ones are refused.
          if (!received && rung > firstRung) startLevel.set(req.model, rung);
          received = true;
          yield text;
        }
        return;
      } catch (error) {
        if (isAbortError(error) || req.signal?.aborted) return;
        // "400 invalid argument" before any text: probably the thinking setting. Try the next rung.
        const rejected = req.lowLatency === true && !received && (error as { status?: number })?.status === 400;
        if (!rejected || rung === THINKING_LEVELS.length - 1) throw toLlmError('gemini', error);
      }
    }
  }

  async function listModels(): Promise<string[]> {
    try {
      const items: GeminiModelInfo[] = [];
      for await (const model of await client.models.list({ config: { pageSize: 100 } })) items.push(model);
      return filterGeminiModels(items);
    } catch (error) {
      throw toLlmError('gemini', error);
    }
  }

  return { id: 'gemini', label: 'Gemini', listModels, stream };
}
