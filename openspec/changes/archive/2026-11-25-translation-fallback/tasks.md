# Tasks

## 1. Choosing the fallback model

- [x] 1.1 Write failing tests for `pickFallbackTranslation` in `server/src/llm/models.test.ts` (the three scenarios); verify they fail
- [x] 1.2 Implement it in `server/src/llm/models.ts`; verify the tests pass

## 2. Retry with the fallback model

- [x] 2.1 Write failing tests in `server/src/translate.test.ts`: a rate limit with a fallback model retries with it at once and names both models; other errors keep the model; without a fallback the old behaviour stays
- [x] 2.2 Implement `fallbackModel` in `server/src/translate.ts`; verify the tests pass
- [x] 2.3 Write a failing test in `server/src/session.test.ts` that the session passes the fallback model chosen from the provider's models; implement in `server/src/session.ts`; verify
- [x] 2.4 Break the fallback retry and the wait-skipping in turn, verify tests fail, restore

## 3. Documentation and checks

- [x] 3.1 Update the README translation section
- [x] 3.2 Run `npm test`, `npm run typecheck` and `openspec validate --strict`
