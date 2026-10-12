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

export function createGeminiProvider({ client }: { client: GeminiClient }): LlmProvider {
  // Models that answered "400 invalid argument" to the minimal-thinking setting.
  // We stop sending it to them (see `stream` below).
  const rejectsMinimalThinking = new Set<string>();

  // One call to the service. Yields the text pieces as they arrive.
  async function* generate(req: LlmRequest, minimalThinking: boolean): AsyncGenerator<string> {
    const pieces = await client.models.generateContentStream({
      model: req.model,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens,
        temperature: req.temperature,
        abortSignal: req.signal,
        ...(minimalThinking ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } } : {}),
      },
    });
    for await (const piece of pieces) {
      if (req.signal?.aborted) return;
      if (piece.text) yield piece.text;
    }
  }

  async function* stream(req: LlmRequest): AsyncGenerator<string> {
    // Translation wants the first words fast, so ask for the least "thinking".
    // Some models do not accept that setting: they answer with HTTP 400 before any text.
    const tryMinimal = req.lowLatency === true && !rejectsMinimalThinking.has(req.model);
    let received = false;

    try {
      for await (const text of generate(req, tryMinimal)) {
        received = true;
        yield text;
      }
      return;
    } catch (error) {
      if (isAbortError(error) || req.signal?.aborted) return;
      const retryable = tryMinimal && !received && (error as { status?: number })?.status === 400;
      if (!retryable) throw toLlmError('gemini', error);
      rejectsMinimalThinking.add(req.model); // remembered: later requests skip the setting
    }

    // Second and last attempt, without the thinking setting.
    try {
      yield* generate(req, false);
    } catch (error) {
      if (isAbortError(error) || req.signal?.aborted) return;
      throw toLlmError('gemini', error);
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
