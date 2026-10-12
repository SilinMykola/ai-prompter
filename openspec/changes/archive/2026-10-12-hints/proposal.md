# Proposal

## Why

Understanding the other person comes first (translation, done). The second job is answering: when the user presses "Коротко" or "Подробно" on a sentence, the app should suggest what to say, or give a cheat sheet on the subject of the question (SPEC.md section 7.3). The buttons, the hotkeys, the message types and the hint block on the screen already exist; the server only ignores `hint` requests so far.

## What Changes

- Add two hint prompts. **Short**: one polite, simple answer in at most two sentences in the language of the sentence, followed on a new line by its Russian translation, using the user's data where needed and leaving bracketed placeholders (for example `[date of birth]`) where data is missing. **Detailed**: a cheat sheet readable in seconds: one summary sentence, three to five short points (at most 12 words each) in the language of the sentence, then `RU:` and the same in Russian.
- A hint is built only on request, for one sentence, from: the call context, the user's data (profile), up to six earlier sentences, and the sentence itself (delimited and stripped of angle brackets, like in translation).
- The answer streams as `hint_start` (with the mode), `hint_delta` pieces and `hint_done`; a failure sends `hint_error`; a new request for the same sentence cancels the earlier one.
- Limits: 200 tokens for short, 500 for detailed, using the session's hint model; no retry (the user can simply press the button again); rate limits show the same short notice as translation; a rejected key is reported once per session, shared with translation.
- Hints are cancelled immediately on stop or disconnect (unlike translations they are not worth waiting for).
- Out of scope: automatic hints without a button press, hint history.

## Capabilities

### New Capabilities
- `reply-hints`: building, streaming, replacing and failing of reply hints.

### Modified Capabilities
- `call-session`: a `hint` message is now handled instead of ignored.

## Impact

- New files: `server/src/hint.ts` and tests; `server/src/prompts.ts` gains `buildHintPrompt`; `server/src/session.ts` handles `hint`.
- The user's profile now reaches the language model, in hint requests only. The README states this clearly.
