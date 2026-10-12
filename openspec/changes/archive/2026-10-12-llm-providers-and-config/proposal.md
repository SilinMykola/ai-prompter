# Proposal

## Why

Translation and hints need an LLM, and the app must work with Gemini, Claude or both depending on which keys the user has. Before sessions can use models, the server needs validated configuration, one provider interface, a registry of available providers, and a way for the browser to learn which models can be chosen. Checking the Gemini API showed that its model list is long and noisy (text-to-speech, image, music and agent models) and contains models that no longer work for new users, so a hand-written `GEMINI_MODELS` list in `.env` would go stale; the user asked to pick models from a list fetched from the API instead.

## What Changes

- Add environment parsing with clear startup failures (`DEEPGRAM_API_KEY` and at least one LLM key are required) and the rule for choosing the default provider.
- Add the `LlmProvider` interface, an `LlmError` with a `kind`, and two implementations: Gemini (`@google/genai`) and Claude (`@anthropic-ai/sdk`), both streaming text and both able to list their models.
- Fetch the model list from each provider's API, keep only text-generation chat models, cache it, and compute a default fast model (translation) and a default strong model (hints). `GEMINI_MODELS` / `ANTHROPIC_MODELS` become optional overrides.
- Add a provider registry that only contains providers with a key, and a check that a `start` message uses an available provider and a known model.
- Serve `GET /api/config` from the real registry.
- **BREAKING (internal):** `ApiConfig` providers gain `defaultTranslationModel` and `defaultHintModel`, so the browser does not have to guess defaults from an unordered list.
- Out of scope: prompts, translation and hint streaming into sessions, the Deepgram connection, any UI.

## Capabilities

### New Capabilities
- `app-configuration`: environment variables, required keys, default provider choice, and startup failure messages.
- `llm-providers`: the provider interface, error classification, model discovery and defaults, provider availability, and validation of session start requests.

### Modified Capabilities
- `session-protocol`: the public config response also carries the default translation and hint model for each provider.

## Impact

- New files in `server/src/` (`config.ts`, `llm/*`, `validateStart.ts`) and their tests; `server/src/server.ts` and `index.ts` wire the registry in; `shared/protocol.ts` and its test change.
- New dependencies: `@google/genai`, `@anthropic-ai/sdk`.
- `.env.example` documents the optional model overrides and the new fallback defaults.
- Claude's model list could not be verified live (no Anthropic key was available); it is covered by tests with a fake client and falls back to built-in model ids.
