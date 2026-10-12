import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { createAnthropicProvider, type AnthropicClient } from './anthropic';
import { createGeminiProvider, type GeminiClient } from './gemini';
import type { ProviderFactories } from './index';

// The only place that creates real SDK clients. Tests use fake clients instead.
// The casts say: "the real client has (at least) the methods our small interface lists".
export const realFactories: ProviderFactories = {
  gemini: (apiKey) => createGeminiProvider({ client: new GoogleGenAI({ apiKey }) as unknown as GeminiClient }),
  anthropic: (apiKey) => createAnthropicProvider({ client: new Anthropic({ apiKey }) as unknown as AnthropicClient }),
};
