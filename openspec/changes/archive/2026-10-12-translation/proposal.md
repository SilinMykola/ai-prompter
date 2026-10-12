# Proposal

## Why

Understanding what the other person asks is the whole point of the app (SPEC.md section 1). Transcription works; the missing piece is the Russian translation of every finished sentence, delivered fast and streamed as it is produced, with the retries and limits behaviour of SPEC.md section 7.2. Translation also needs two small protocol additions that the original spec lacks: a message that restarts a card's translation text when a retry begins (otherwise pieces of two attempts would be glued together), and a message for short notices such as "provider rate limit".

## What Changes

- Add translation prompts: a system prompt that makes the model act as an interpreter into Russian (names, numbers, dates exact; German official terms translated with the original in brackets; programming terms left alone; broken sentences translated as they are), the call context, up to 4 previous sentences as context only, and the sentence inside delimiters so that speech is never treated as instructions. The user's personal data (profile) is never part of it.
- Translate every finished sentence immediately and in parallel with the chosen translation model (300 tokens, temperature 0, low latency), streaming `translation_delta` and ending with `translation_done`.
- Retry once after an error or a 10-second timeout, then send `translation_error`; after a rate-limit error wait 2 seconds before the retry and send a notice; report a rejected API key once as an error.
- Handle `retranslate` for a given sentence.
- On stop, give translations that are still running a few seconds to finish before the session closes.
- **Protocol additions:** `translation_start` (server to client: restart the translation of that card) and `notice` (server to client: a short message that goes away by itself).
- The browser shows `notice` messages like its other short notes, and a `translation_start` empties the card's translation and shows the waiting indicator.
- Out of scope: hints (next change), choosing a different provider mid-call.

## Capabilities

### New Capabilities
- `translation`: how finished sentences are translated, streamed, retried and re-requested.

### Modified Capabilities
- `session-protocol`: two new server messages, `translation_start` and `notice`.
- `call-state`: a restarted translation replaces the old text and goes back to waiting.
- `call-session`: sentences start translations, `retranslate` is handled, translations get time to finish on stop.
- `call-orchestration`: notices from the server are shown as short notes.

## Impact

- New files: `server/src/prompts.ts`, `server/src/translate.ts` and tests; `server/src/session.ts`, `shared/protocol.ts`, `web/src/lib/callReducer.ts`, `web/src/lib/callSession.ts` change with tests.
- README: translation behaviour and the two new messages.
