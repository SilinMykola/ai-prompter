import type { ServerMessage } from '@ai-prompter/shared/protocol';
import { LlmError, toLlmError } from './llm/errors';
import type { LlmProvider } from './llm/types';
import { buildTranslationPrompt, type TranslationContext } from './prompts';

// Translates one sentence: asks the model, streams the answer to the browser as it comes,
// and copes with the usual trouble (errors, slow answers, rate limits) as SPEC.md 7.2 says.

const ATTEMPT_TIMEOUT_MS = 10_000;
const RATE_LIMIT_WAIT_MS = 2000;
const MAX_TOKENS = 300;

export interface TranslateOptions {
  provider: Pick<LlmProvider, 'stream'>;
  model: string;
  /** The sentence's id: every message sent carries it. */
  id: number;
  context: TranslationContext;
  /** Sends a message to the browser. */
  emit(message: ServerMessage): void;
  /** The session is over: stop quietly, send nothing more. */
  signal?: AbortSignal;
  /** Announce `translation_start` before the first attempt (a requested re-translation). */
  restart?: boolean;
  /** The provider rejected the API key. The caller decides how to tell the user (once per session). */
  onAuthError?(): void;
  /** Replaceable in tests so that nothing really waits. */
  sleep?(ms: number): Promise<void>;
  /** Event names only. Never the text of the call. */
  log?(event: string): void;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function translateSentence(options: TranslateOptions): Promise<void> {
  const { provider, model, id, context, emit, signal } = options;
  const sleep = options.sleep ?? realSleep;
  const log = options.log ?? (() => {});
  const prompt = buildTranslationPrompt(context);

  // One try. Resolves when the whole translation was streamed; throws if it went wrong.
  async function attempt(): Promise<void> {
    // This try may be cut short by the 10-second timer or by the session ending.
    const timeout = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeout.abort();
    }, ATTEMPT_TIMEOUT_MS);
    const cancel = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;

    try {
      let gotText = false;
      for await (const piece of provider.stream({
        model,
        system: prompt.system,
        user: prompt.user,
        maxTokens: MAX_TOKENS,
        temperature: 0,
        lowLatency: true, // the first words matter more than perfect wording
        signal: cancel,
      })) {
        if (piece === '') continue;
        // Whitespace alone ("…words" + " " + "more…") is part of a text, but it is not a translation.
        if (piece.trim() !== '') gotText = true;
        emit({ type: 'translation_delta', id, delta: piece });
      }
      // A cancelled stream just ends (it does not throw), so look at why it ended.
      if (signal?.aborted) return;
      if (timedOut) throw new LlmError('timeout', 'translation attempt timed out');
      if (!gotText) throw new LlmError('other', 'the model returned no text');
    } finally {
      clearTimeout(timer);
    }
  }

  if (signal?.aborted) return;
  if (options.restart) emit({ type: 'translation_start', id });

  for (let tries = 1; tries <= 2; tries++) {
    try {
      await attempt();
      if (!signal?.aborted) emit({ type: 'translation_done', id });
      return;
    } catch (error) {
      if (signal?.aborted) return;
      const failure = toLlmError('translation', error);
      log(`translation_failed kind=${failure.kind} try=${tries}`);

      if (failure.kind === 'auth') {
        options.onAuthError?.(); // asking again with the same key cannot help
        break;
      }
      if (tries === 2) break;

      if (failure.kind === 'rate_limit') {
        emit({ type: 'notice', message: 'Лимит запросов провайдера. Повторяю через 2 секунды…' });
        await sleep(RATE_LIMIT_WAIT_MS);
        if (signal?.aborted) return;
      }
      emit({ type: 'translation_start', id }); // the retry starts from scratch
    }
  }

  if (!signal?.aborted) emit({ type: 'translation_error', id });
}
