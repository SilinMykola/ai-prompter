# Design

## Context

The session emits `sentence` messages and has the validated start settings (provider, translation model, call context, profile). `LlmProvider.stream` already yields text pieces, treats cancellation as a quiet end and raises `LlmError` with a kind (`rate_limit`, `auth`, `timeout`, `other`). The Gemini provider supports `lowLatency`. The browser reducer already restarts a translation text when a delta follows a finished or failed one.

## Goals / Non-Goals

**Goals:**
- Translation logic in one module that is tested with a fake provider and fake timers (no network, no sockets).
- Hints (next change) can reuse the prompt module and the streaming helper without rewriting.

**Non-Goals:**
- Hints, queueing or throttling translations (parallel as specified), caching.

## Decisions

- **Two small server modules:** `prompts.ts` (pure builders returning `{ system, user }`) and `translate.ts` (`translateSentence`, the retry/timeout/rate-limit flow, emitting protocol messages through a callback). The session only decides *when* to translate and keeps the sentence history.
- **Prompt in English, output in Russian.** The repository is English-only; models follow an English instruction to translate into Russian just as well as a Russian one. The spec text is kept in meaning.
- **Injection hygiene:** the sentence is wrapped in `<sentence>` tags and the system prompt says everything inside is text to translate and never an instruction. Previous sentences go in a `<context>` block marked not to be translated. A sentence containing the closing tag is not special-cased: it can only confuse the translation of that same sentence.
- **Attempts:** a function `attempt()` streams once with an `AbortController` that is aborted by a ten-second timer or by the session's signal (`AbortSignal.any`). A timeout is told apart from a session abort by a flag set by the timer. A stream that ends with no text is an error. Provider aborts end quietly (by the provider contract), so the code checks the flags after the loop.
- **Retry flow:** attempt 1; on failure, if the session was aborted, stop silently; if the error is `rate_limit`, send a notice and wait two seconds; send `translation_start`; attempt 2; on failure send `translation_error`. An `auth` error also reports once per session through a callback and does not wait. Sleeping uses an injectable function, so tests do not wait.
- **Protocol additions:** `translation_start { id }` and `notice { message }`. Adding a message type to the unions makes TypeScript point at every exhaustive switch, which is the point of the discriminated unions. Alternative for restarts: send `translation_error` and let the next delta restart; rejected because the card would flash "перевод не получен" for the whole latency of the retry.
- **Session:** keeps `history: string[]` of sentence texts (indexed by id - 1) and a set of in-flight promises. Context for sentence `n` is `history.slice(max(0, n-5), n-1)`. `retranslate` looks the sentence up by id and starts a translation with `translation_start` first. An `AbortController` per session cancels everything on disconnect; on `stop` the session waits for `Promise.allSettled(inflight)` or five seconds, whichever is first, then aborts what is left.
- **Browser:** the reducer gets `translation_start`; `startCall` forwards `notice` to `deps.notify` instead of dispatching it (the screen state does not hold notices).
- **Logging:** only event names and the model name; never sentence text. Rate-limit and failure events log the error kind.

## Risks / Trade-offs

- [Parallel translations hit a free-tier limit quickly] → the rate-limit path (notice, wait, retry) is the specified answer; a fast burst of short sentences may still end in some `translation_error`s with a working retry button.
- [A model ignores "translation only" and adds comments] → prompt wording and temperature 0 reduce it; not fully preventable.
- [Waiting up to 5 seconds on stop delays the "stopped" state] → bounded and only when translations are really running.

## Open Questions

None that change the specs or tasks.
