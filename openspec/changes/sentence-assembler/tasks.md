# Tasks

## 1. Interim text, boundaries and ids

- [x] 1.1 Write failing tests in `server/src/sentences.test.ts` for interim results, two sentences in one result, question and exclamation, unfinished tail kept, continuation across results, and increasing ids; run `npm test` and verify they fail because `sentences.ts` does not exist
- [x] 1.2 Implement `createSentenceAssembler()` in `server/src/sentences.ts` (buffer, interim text, boundary scan, ids) with explanatory comments; verify the tests from 1.1 pass
- [x] 1.3 Break the behaviour on purpose (for example always treat a boundary as not found), verify the boundary tests fail, then restore the code

## 2. Numbers, dates and abbreviations

- [x] 2.1 Write failing tests for `3.5`, `12.10.2026`, each abbreviation (`z.B.`, `Dr.`, `Nr.`, `bzw.`, `ca.`, `e.g.`, `Mr.`, `Mrs.`, in mixed case), and an abbreviation at the end of the buffer followed by a later result; verify they fail
- [x] 2.2 Implement the digit and abbreviation checks; verify the tests pass and the group 1 tests still pass
- [x] 2.3 Remove one abbreviation from the set and the digit rule in turn, verify the matching tests fail each time, then restore

## 3. Flushing, long text and empty input

- [x] 3.1 Write failing tests for `speech_final` flush, `UtteranceEnd` flush, `UtteranceEnd` with an empty buffer, a 350-character phrase (all pieces at most 300 characters, words preserved), comma preference when splitting, an empty transcript, and punctuation-only input (`...`, ` .`); verify they fail
- [x] 3.2 Implement `pushUtteranceEnd`, the flush on `speech_final`, the 300-character split and the empty/punctuation filter; verify all tests in the file pass
- [x] 3.3 Change the limit to 400 and skip the punctuation filter in turn, verify the matching tests fail, then restore
- [x] 3.4 Run `npm test` and `npm run typecheck` from the repository root and verify both exit 0; run the code-review skill on the diff and fix its findings

## 4. Day numbers (ordinal dates)

- [x] 4.1 Write failing tests for "am 12. Oktober", "am 3. Mai", a day number at the end of the buffer followed by a later result, a three-digit number that still ends a sentence, and `UtteranceEnd` flushing a pending "am 12."; verify they fail
- [x] 4.2 Implement the one- or two-digit rule next to the abbreviation check; verify all tests pass
- [ ] 4.3 Disable the rule, verify the new tests fail, restore it; run `npm test`, `npm run typecheck` and the code-review skill on the diff
