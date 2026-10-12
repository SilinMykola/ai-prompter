import type { HintMode, ServerMessage } from '@ai-prompter/shared/protocol';
import { LlmError, toLlmError } from './llm/errors';
import type { LlmProvider } from './llm/types';
import { buildHintPrompt, type HintContext } from './prompts';

// Produces one reply hint and streams it to the browser. A sibling of translate.ts, but simpler:
// no automatic retry (pressing the button again is the retry), and a longer timeout, because
// the stronger model used for hints may think for a while before it answers.

const HINT_TIMEOUT_MS = 45_000;

export interface HintOptions {
  provider: Pick<LlmProvider, 'stream'>;
  model: string;
  /** The sentence the hint is for: every message sent carries it. */
  id: number;
  mode: HintMode;
  context: HintContext;
  emit(message: ServerMessage): void;
  /** Cancelled: stop quietly, send nothing more. */
  signal?: AbortSignal;
  /** The provider rejected the API key. The caller tells the user once per session. */
  onAuthError?(): void;
  /** Event names only. Never the text of the call, the user's data or the hint. */
  log?(event: string): void;
}

export async function streamHint(options: HintOptions): Promise<void> {
  const { provider, model, id, mode, context, emit, signal } = options;
  const log = options.log ?? (() => {});
  const prompt = buildHintPrompt(mode, context);

  if (signal?.aborted) return;
  emit({ type: 'hint_start', id, mode }); // the screen empties the card's hint block

  const timeout = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeout.abort();
  }, HINT_TIMEOUT_MS);
  const cancel = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;

  try {
    let gotText = false;
    for await (const piece of provider.stream({
      model,
      system: prompt.system,
      user: prompt.user,
      maxTokens: prompt.maxTokens,
      temperature: prompt.temperature,
      signal: cancel,
    })) {
      if (piece === '') continue;
      if (piece.trim() !== '') gotText = true;
      emit({ type: 'hint_delta', id, delta: piece });
    }
    // A cancelled stream just ends (it does not throw), so look at why it ended.
    if (signal?.aborted) return;
    if (timedOut) throw new LlmError('timeout', 'hint timed out');
    if (!gotText) throw new LlmError('other', 'the model returned no text');
    emit({ type: 'hint_done', id });
  } catch (error) {
    if (signal?.aborted) return;
    const failure = timedOut ? new LlmError('timeout', 'hint timed out') : toLlmError('hint', error);
    log(`hint_failed kind=${failure.kind} mode=${mode}`);
    if (failure.kind === 'auth') options.onAuthError?.();
    if (failure.kind === 'rate_limit') {
      emit({ type: 'notice', message: 'Лимит запросов провайдера. Подсказка не получена, попробуйте чуть позже.' });
    }
    emit({ type: 'hint_error', id });
  } finally {
    clearTimeout(timer);
  }
}
