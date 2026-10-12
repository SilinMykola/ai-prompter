# Tasks

## 1. Protocol additions

- [ ] 1.1 Add failing compile-time cases for `translation_start` and `notice` to `shared/protocol.test.ts` (the exhaustive switch and the counts become 14 server messages); verify `npm run typecheck` fails
- [ ] 1.2 Add the two message types to `shared/protocol.ts` with comments; verify typecheck passes for all workspaces, fixing the exhaustive switches the compiler points at
- [ ] 1.3 Write failing reducer tests for `translation_start` (empties and goes back to waiting, unknown id ignored) in `web/src/lib/callReducer.test.ts`; implement it in `callReducer.ts`; verify the tests pass
- [ ] 1.4 Write a failing orchestrator test that a `notice` message goes to `notify` and not to `dispatch` in `web/src/lib/callSession.test.ts`; implement it in `callSession.ts`; verify

## 2. Prompts

- [ ] 2.1 Write failing tests in `server/src/prompts.test.ts` for the system prompt content (interpreter into Russian, translation only, exact names and numbers, German official terms with original in brackets, programming terms left, fragments as they are), the call context and its absence, at most four previous sentences in order, no context section for the first sentence, the sentence inside delimiters with an instruction-like sentence staying inside them, and the profile never appearing; verify they fail
- [ ] 2.2 Implement `buildTranslationPrompt` in `server/src/prompts.ts`; verify the tests pass
- [ ] 2.3 Break the four-sentence limit and the delimiters in turn, verify tests fail, restore

## 3. Translating a sentence

- [ ] 3.1 Write failing tests in `server/src/translate.test.ts` (fake provider, fake timers, fake sleep) for streamed pieces then done with the sentence id, the request parameters (model, 300 tokens, temperature 0, low latency, prompt from the prompts module), recovery on the second attempt with `translation_start`, failing twice giving `translation_error`, the 10-second timeout, an empty answer, rate limit giving a notice and a two-second wait, auth giving one error callback, and a session abort ending silently; verify they fail
- [ ] 3.2 Implement `translateSentence` in `server/src/translate.ts`; verify the tests pass
- [ ] 3.3 Break the retry limit, the timeout and the abort handling in turn, verify tests fail, restore

## 4. Session integration

- [ ] 4.1 Write failing tests in `server/src/session.test.ts` for translations starting for each sentence in parallel with the right context and settings, `retranslate` for a known and an unknown id, the profile never reaching the provider, a single key error per session, stop waiting for running translations up to five seconds, and browser disconnect aborting them; verify they fail
- [ ] 4.2 Implement the integration in `server/src/session.ts` and wire the provider lookup; verify the tests pass and the earlier session tests still pass
- [ ] 4.3 Break the parallelism and the profile exclusion in turn, verify tests fail, restore

## 5. Live check and wrap-up

- [ ] 5.1 Run a live check with the real server, real Deepgram (the synthesised German speech) and the real Gemini key: see sentences with streamed Russian translations, a measured delay from sentence to first translation text, and no conversation text in the server log
- [ ] 5.2 Document translation and the two new messages in the README; run `npm test`, `npm run typecheck`, `npm run build` and the code-review skill; fix findings
