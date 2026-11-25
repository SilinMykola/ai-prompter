# Tasks

## 1. Sentence assembler keeps the tail

- [x] 1.1 Change the tests in `server/src/sentences.test.ts`: `speech_final` and `UtteranceEnd` keep the tail, `UtteranceEnd` clears the interim text, `flush()` emits the tail and does nothing on an empty buffer, a tail continues across `UtteranceEnd`; verify they fail
- [x] 1.2 Implement in `server/src/sentences.ts`; verify the tests pass
- [x] 1.3 Put the old flush back on `UtteranceEnd`, verify the tests fail, restore

## 2. The session flushes after a silence

- [x] 2.1 Write failing tests in `server/src/session.test.ts` (fake timers): no sentence on utterance end, the sentence after 3 s of silence, a continuation within 1.8 s joins and nothing more comes later, interim results keep the tail waiting, stop flushes before `stopped`
- [x] 2.2 Implement the timer in `server/src/session.ts`; verify the tests pass
- [x] 2.3 Break the timer restart on interim results and the flush on stop in turn, verify tests fail, restore

## 3. Default translation model

- [x] 3.1 Change the test in `server/src/llm/models.test.ts` to expect `gemini-flash-lite-latest` when offered; verify it fails
- [x] 3.2 Change `PREFERRED_TRANSLATION` in `server/src/llm/models.ts`; verify the tests pass

## 4. Entire-screen source

- [x] 4.1 Write failing tests in `web/src/lib/audioCapture.test.ts` (the request for `screen`, the error without audio, the tab request unchanged), `web/src/lib/settings.test.ts` (`screen` is remembered) and `web/src/components/SetupScreen.test.tsx` (the option is offered and selectable)
- [x] 4.2 Implement in `web/src/lib/audioCapture.ts`, `web/src/lib/settings.ts`, `web/src/components/SetupScreen.tsx`; verify the tests pass
- [x] 4.3 Break the `screen` request, verify the test fails, restore

## 5. Documentation and checks

- [x] 5.1 Update the README: Zoom app source, sentences held for 3 s, the default translation model
- [x] 5.2 Run `npm test` and `npm run typecheck`
