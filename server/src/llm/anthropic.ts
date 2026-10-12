import { isAbortError, toLlmError } from './errors';
import { filterClaudeModels } from './models';
import type { LlmProvider, LlmRequest } from './types';

// One event of a streamed Claude answer. Most events are bookkeeping; only
// "content_block_delta" events with a "text_delta" carry text.
interface AnthropicEvent {
  type: string;
  delta?: { type: string; text?: string };
}

// The parts of the `@anthropic-ai/sdk` client that we use (see GeminiClient for the idea).
export interface AnthropicClient {
  models: { list(): AsyncIterable<{ id: string }> };
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        system: string;
        messages: Array<{ role: 'user'; content: string }>;
        temperature?: number;
        stream: true;
      },
      options?: { signal?: AbortSignal },
    ): Promise<AsyncIterable<AnthropicEvent>>;
  };
}

export function createAnthropicProvider({ client }: { client: AnthropicClient }): LlmProvider {
  async function* stream(req: LlmRequest): AsyncGenerator<string> {
    try {
      const events = await client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          temperature: req.temperature,
          stream: true,
        },
        { signal: req.signal },
      );
      for await (const event of events) {
        if (req.signal?.aborted) return;
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      if (isAbortError(error) || req.signal?.aborted) return;
      throw toLlmError('anthropic', error);
    }
  }

  async function listModels(): Promise<string[]> {
    try {
      const ids: string[] = [];
      for await (const model of client.models.list()) ids.push(model.id);
      return filterClaudeModels(ids);
    } catch (error) {
      throw toLlmError('anthropic', error);
    }
  }

  return { id: 'anthropic', label: 'Claude', listModels, stream };
}
