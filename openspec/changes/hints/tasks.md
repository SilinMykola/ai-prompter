# Tasks

## 1. Hint prompts

- [x] 1.1 Write failing tests in `server/src/prompts.test.ts` for the short prompt (two sentences at most, Russian translation on a new line, bracketed placeholders, no invention, 200 tokens) and the detailed prompt (gist line, 3-5 points of at most 12 words, exact names, "RU:" block, no introduction or conclusion, everyday questions, unsure facts left out, profession and stack, 500 tokens), the context in both (call context, profile marked as not instructions, up to six earlier sentences, the sentence in delimiters), angle brackets removed everywhere, and an empty profile or context being described as missing; verify they fail
- [x] 1.2 Implement `buildHintPrompt` in `server/src/prompts.ts`, sharing the angle-bracket helper with the translation prompt; verify all prompt tests pass
- [x] 1.3 Break the six-sentence limit and the 200/500 token limits in turn, verify tests fail, restore

## 2. Streaming a hint

- [x] 2.1 Write failing tests in `server/src/hint.test.ts` (fake provider, fake timers) for `hint_start` with the mode first, pieces then `hint_done`, the request parameters (hint model, token limit, no low-latency flag, prompt from the prompts module), an error in the middle giving `hint_error`, an empty answer giving `hint_error`, the 45-second timeout, a rate limit giving a notice and `hint_error`, auth calling the callback and giving `hint_error`, cancellation staying silent, and no text in the log; verify they fail
- [x] 2.2 Implement `streamHint` in `server/src/hint.ts`; verify the tests pass
- [x] 2.3 Break the timeout and the abort handling in turn, verify tests fail, restore

## 3. Session integration

- [ ] 3.1 Write failing tests in `server/src/session.test.ts` for a `hint` request reaching the hint function with the sentence, the six earlier sentences, the call context, the profile, the hint model and the mode; unknown ids and modes ignored; a new request for the same sentence cancelling the old one but not other sentences' hints or translations; one rejected-key message for translation and hints together; `stop` not waiting for hints and cancelling them; disconnect cancelling them; a crashing or synchronously throwing hint function being survived; and the profile reaching hints but never translation; verify they fail
- [ ] 3.2 Implement `hint` handling in `server/src/session.ts`; verify the tests pass and earlier tests still pass
- [ ] 3.3 Break the per-sentence cancellation and the profile exclusion from translation in turn, verify tests fail, restore

## 4. Live check and wrap-up

- [ ] 4.1 Run a live check with the real server and Gemini: request a short and a detailed hint (for example for "Wie erstellt man einen Indexer in Magento 2?"), check the short one is at most two sentences plus Russian and the detailed one has the gist, 3-5 points and an "RU:" block, and that the server log has no text
- [ ] 4.2 Document hints in the README (including that the profile is sent to the model for hints); run `npm test`, `npm run typecheck`, `npm run build` and the code-review skill; fix findings
