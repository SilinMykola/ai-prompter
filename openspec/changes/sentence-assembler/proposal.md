# Proposal

## Why

Deepgram sends speech as a stream of partial and final text fragments, not as sentences. The UI shows one card per sentence and the translator works per sentence, so something must turn the fragment stream into clean, numbered sentences. This is the first piece of real logic in the server and it has no I/O, which makes it the right place to start test-first.

## What Changes

- Add a pure module `server/src/sentences.ts` that consumes recognition results and `UtteranceEnd` events and produces numbered sentences plus the text for the live card.
- Boundaries are `.`, `?`, `!` or `…` followed by whitespace or the end of the buffer, except dots inside numbers or dates (`3.5`, `12.10.2026`) and after known abbreviations (`z.B.`, `Dr.`, `Nr.`, `bzw.`, `ca.`, `e.g.`, `Mr.`, `Mrs.`).
- `speech_final` or `UtteranceEnd` flushes whatever is left in the buffer as a sentence, even without closing punctuation.
- A dot after a one- or two-digit number ("am 12. Oktober") is not a boundary, because it is almost always a German ordinal date.
- Over-long text (more than 300 characters without a boundary) is split at the last comma or space.
- Empty and punctuation-only strings never become sentences.
- Out of scope (later changes): the Deepgram connection, sending `interim`/`sentence` messages over the WebSocket, translation.

## Capabilities

### New Capabilities
- `sentence-assembly`: how a stream of speech-recognition results becomes numbered sentences and live-card text.

### Modified Capabilities

## Impact

- New files: `server/src/sentences.ts`, `server/src/sentences.test.ts`.
- No new dependencies; no change to existing code or to the WebSocket protocol.
