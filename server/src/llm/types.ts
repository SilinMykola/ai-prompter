import type { ProviderId } from '@ai-prompter/shared/protocol';

export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** Cancels the request. A cancelled stream just ends; it is not an error. */
  signal?: AbortSignal;
  /** Ask the model to answer as fast as possible (little or no "thinking"). Used for translation. */
  lowLatency?: boolean;
}

export interface LlmProvider {
  readonly id: ProviderId;
  /** Human-readable name for the UI. */
  readonly label: string;
  /** Chat models this provider's API offers right now (already filtered). */
  listModels(): Promise<string[]>;
  /** Streams the answer text in pieces. Failures are thrown as LlmError. */
  stream(req: LlmRequest): AsyncIterable<string>;
}
