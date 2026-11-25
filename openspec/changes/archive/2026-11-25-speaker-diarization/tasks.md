# Tasks

## 1. Recognition

- [x] 1.1 Write failing tests in `server/src/stt/deepgram.test.ts`: `diarize=true` in the URL, the majority speaker of a result, no speaker without words; implement in `server/src/stt/deepgram.ts` and `SttResult`; verify

## 2. Sentences and paragraphs

- [x] 2.1 Write failing tests in `server/src/sentences.test.ts` (speaker change ends the sentence, same speaker joins, unknown speaker as before) and `server/src/paragraphs.test.ts` (a new speaker starts a paragraph); implement; verify
- [x] 2.2 Write failing tests in `server/src/session.test.ts` (speaker in `sentence`, new paragraph for a new speaker); add `speaker` to `SentenceMessage` in `shared/protocol.ts`; implement in `server/src/session.ts`; verify

## 3. Call screen

- [x] 3.1 Write failing tests: the reducer keeps the speaker (`web/src/lib/callReducer.test.ts`), labels with two speakers and none with one (`web/src/components/CallScreen.test.tsx`); implement in `callReducer.ts`, `ParagraphCard.tsx`, `CallScreen.tsx`, `styles.css`; verify

## 4. Checks

- [x] 4.1 Break the speaker split, the paragraph rule and the one-speaker rule in turn; verify tests fail; restore
- [x] 4.2 Update the README; run `npm test`, `npm run typecheck`, `openspec validate --strict`
