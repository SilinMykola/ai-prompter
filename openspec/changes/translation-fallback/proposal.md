# Proposal

## Why

In the live call of 2026-11-25 the translation model `gemini-flash-lite-latest` hit the free-tier request limit (HTTP 429) six times in five and a half minutes, and 2 of 89 sentences were never translated: the retry after two seconds hit the same limit. On the same key, at the same moment, other Gemini models still answered (`gemini-2.5-flash` was out of quota while `gemini-flash-lite-latest` and `gemini-3.5-flash-lite` answered), so the limits are counted per model and another fast model can take over.

## What Changes

- At the start of a call the server picks a fallback translation model: the newest other "flash-lite" / "haiku" model, else the newest other plain "flash" model, else none.
- When a translation attempt is rate limited and a fallback model exists, the retry goes to the fallback model at once, without the two-second wait, and the notice names both models. Without a fallback model nothing changes.
- README updated.
- Out of scope: staying on the fallback model for later sentences, a choice of the fallback model in the UI.

## Capabilities

### New Capabilities

### Modified Capabilities
- `translation`: the rate-limit retry uses the fallback model.
- `llm-providers`: choosing the fallback translation model.

## Impact

- `server/src/llm/models.ts`, `server/src/translate.ts`, `server/src/session.ts` and their tests; README.
- No protocol change, no new dependencies.
