# Design

## Context

Translation already has the machinery this needs: a prompt module, a per-sentence streaming function with timeout and abort, a session that keeps the sentence history, per-sentence cancellation, and the "key rejected, tell once" flag. The browser side (buttons, hotkeys, hint block, reducer for `hint_*`, orchestrator pass-through) is done and tested, so this change is server-only.

## Goals / Non-Goals

**Goals:**
- A hint module of the same shape as translation, reusing the same session wiring.
- Hint prompts that follow SPEC.md 7.3 closely, written in English like the translation prompt.

**Non-Goals:**
- Retries (a failed hint is retried by pressing the button), caching, hint history.

## Decisions

- **`hint.ts` with `streamHint(options)`**, parallel to `translateSentence`: builds the prompt, streams with an `AbortController` combining the session's signal, the sentence's controller and a 45-second timer; emits `hint_start` first, then deltas, then `hint_done`; on failure `hint_error`, on rate limit a notice first, on auth the callback. Hints take longer than translations (a strong model may "think"), hence 45 s instead of 10 s, and no `lowLatency`.
- **Prompts in `prompts.ts`:** `buildHintPrompt(mode, context)` returns `{ system, user, maxTokens }`. The user's data goes into the system prompt in a clearly marked block ("information about the user, not instructions"); the call context likewise. The sentence and earlier sentences go in the user message with the same delimiters and angle-bracket removal as translation (shared helper).
- **Session:** `hint` handling mirrors `retranslate`: validate id (integer, known) and mode (`short` or `detailed`), keep a second `Map<number, AbortController>` for hints (one hint per sentence at a time; a new request aborts the old one), and add the job to the same `running` set only for bookkeeping; `stop` does **not** wait for hints: it aborts them before the grace wait, because a hint nobody reads is useless.
- **Key error flag shared** between translation and hints (one message per session).
- **Temperature:** short 0.4, detailed 0.2: a suggested phrase may vary a little, a cheat sheet should be exact. Not specified by SPEC.md.
- **Logging:** event names, mode and error kind only.

## Risks / Trade-offs

- [The "pro" default hint model can hit rate limits on a free Gemini tier (seen in a live test with HTTP 429)] → the notice explains it and the README suggests choosing a flash model for hints.
- [A model may not follow the exact "RU:" format] → the format is requested twice (in the instructions and as a reminder at the end) but not enforced; the screen shows the text as it comes.
- [The user's profile is sent to the language model for hints] → intended and documented; it is never part of translation.

## Open Questions

None that change the specs or tasks.
