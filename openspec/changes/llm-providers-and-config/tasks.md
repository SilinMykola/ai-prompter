# Tasks

## 1. Configuration

- [x] 1.1 Write failing tests in `server/src/config.test.ts` for missing Deepgram key, no LLM key, one LLM key, blank values, default provider choice and warning, model overrides (with spaces), and blank `PORT`; verify they fail
- [x] 1.2 Implement `loadConfig(env)` and `ConfigError` in `server/src/config.ts`; verify the tests pass
- [x] 1.3 Make `server/src/index.ts` use `loadConfig`, print a `ConfigError` message and exit with code 1; verify by starting the server with an empty environment and seeing the message and exit code 1
- [x] 1.4 Break the default-provider rule and the blank-value rule in turn, verify tests fail, restore; document the variables in `.env.example`

## 2. Errors and model selection

- [ ] 2.1 Write failing tests in `server/src/llm/errors.test.ts` for status mapping (429, 401, 403, 408, 504, 500, a timeout-named error, an abort error); verify they fail
- [ ] 2.2 Implement `LlmError` and `toLlmError` in `server/src/llm/errors.ts`; verify the tests pass
- [ ] 2.3 Write failing tests in `server/src/llm/models.test.ts` for filtering the noisy Gemini list (using a trimmed copy of the real list as a fixture), prefix stripping, Claude filtering, version comparison, preview tie-break, and default fast/strong selection; verify they fail
- [ ] 2.4 Implement `filterGeminiModels`, `filterClaudeModels`, `pickDefaults` in `server/src/llm/models.ts`; verify the tests pass
- [ ] 2.5 Break the deny pattern and the version comparison in turn, verify tests fail, restore

## 3. Providers

- [ ] 3.1 Define `LlmProvider`, `LlmRequest` in `server/src/llm/types.ts`; write failing tests in `server/src/llm/gemini.test.ts` with a fake client for chunk order, passed limits, abort ending the stream quietly, error mapping, low-latency thinking setting, and the retry on HTTP 400 remembered per model; verify they fail
- [ ] 3.2 Implement `createGeminiProvider` in `server/src/llm/gemini.ts` (listing and streaming); verify the tests pass
- [ ] 3.3 Write failing tests in `server/src/llm/anthropic.test.ts` with a fake client for chunk order, limits, abort, error mapping and listing; verify they fail, then implement `createAnthropicProvider` in `server/src/llm/anthropic.ts` and verify they pass
- [ ] 3.4 Break the chunk order and the abort handling in turn, verify tests fail, restore
- [ ] 3.5 Run a manual check against the real Gemini API with the key from `.env` (list models, stream a short translation, abort one stream); verify output and that no key appears in logs

## 4. Registry, validation and endpoint

- [ ] 4.1 Update `shared/protocol.ts` and `shared/protocol.test.ts` so provider info carries `defaultTranslationModel` and `defaultHintModel`; verify `npm run typecheck` fails first on the test, then passes
- [ ] 4.2 Write failing tests in `server/src/llm/registry.test.ts` for providers without keys being absent, override lists, fallback when listing fails, ten-minute caching and the short failure cache (fake clock), defaults inside the model list; verify they fail
- [ ] 4.3 Implement `createRegistry` in `server/src/llm/index.ts`; verify the tests pass
- [ ] 4.4 Write failing tests in `server/src/validateStart.test.ts` for unavailable provider, unknown translation model, unknown hint model and a valid start; implement `validateStart` in `server/src/validateStart.ts`; verify they pass
- [ ] 4.5 Write a failing test that `GET /api/config` returns the registry's config without secrets; wire the registry into `createApp`/`startServer` and `index.ts`; verify it passes and `curl 127.0.0.1:8787/api/config` against the real `.env` shows Gemini with sensible defaults and no keys
- [ ] 4.6 Break the cache and `validateStart` in turn, verify tests fail, restore; update `.env.example` and the README (providers, optional model overrides, fallback ids, the deviation from SPEC.md); run `npm test`, `npm run typecheck`, and the code-review skill, and fix findings
