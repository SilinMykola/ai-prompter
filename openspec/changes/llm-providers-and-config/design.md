# Design

## Context

Server so far: a placeholder Express app, a pure sentence assembler, shared protocol types. Facts found by calling the real APIs while planning:

- Gemini `models.list` returned 62 entries, of which a minority are chat models; the rest are text-to-speech, image, music, agent, research or robotics models. `gemini-2.5-flash-lite` is still listed but answers 404 "no longer available to new users", so a list entry is not proof that a model works.
- For the 3.5 Gemini models, `thinkingConfig.thinkingBudget: 0` is rejected with HTTP 400, while `thinkingLevel: 'MINIMAL'` is accepted; omitting the setting also works and was fast (about 0.6 s to the first chunk for a short translation).
- Gemini streaming: `ai.models.generateContentStream({ model, contents, config })`, chunks expose `.text`. Anthropic: `client.models.list()` (async iterable) and the streaming messages API. SDK errors carry an HTTP `status`.
- No Anthropic key was available, so the Claude side is verified with a fake client only.

## Goals / Non-Goals

**Goals:**
- Everything model-related behind one small interface; the session code never learns which provider is used.
- Defaults chosen automatically so the user rarely has to touch the model pickers.
- Logic that can be unit tested without the network: parsing, filtering, defaults, error mapping, caching, validation.

**Non-Goals:**
- Prompts and the actual translation/hint flows (next changes).
- Probing each listed model for availability (would cost requests); a dead default is handled by the retry/error path in sessions.

## Decisions

- **Interface:** `LlmProvider { id; label; listModels(): Promise<string[]>; stream(req): AsyncIterable<string> }`. `listModels` is async because it calls an API; this replaces the synchronous `models: string[]` from SPEC.md section 7.1. `LlmRequest` gains `lowLatency?: boolean`, used for translation.
- **SDK client injected into each provider factory** (`createGeminiProvider({ client })`), so tests pass a fake client; real clients are created in the registry factory.
- **Abort is not an error.** SDK abort errors are swallowed so the stream just ends; callers check `signal.aborted`. `LlmError` stays for real failures.
- **`LlmError` is a class** extending `Error` (the one class in the codebase): subclassing `Error` has no function-style equivalent.
- **Error mapping by HTTP status** shared by both SDKs through one function `toLlmError(error)`; timeouts detected by status 408/504 or an error whose name contains "Timeout".
- **Model filtering by name**, not by API metadata alone: Gemini names are matched with an allow pattern (`^gemini-`) minus a deny pattern (`tts|image|lyria|robotics|computer-use|transcribe|omni|embedding|live|audio|nano-banana|deep-research|antigravity|customtools|gemma`); Gemini also requires `generateContent` in `supportedActions`. Claude models are kept if the id starts with `claude-`. Alternative: trust `supportedActions` only, rejected because TTS and image models also support `generateContent`.
- **Defaults by name and version.** Fast: id contains `flash-lite` or `haiku`, else `flash`; strong: contains `pro` or `sonnet`, else the newest model. "Newest" compares the numbers in the id (e.g. 3.5 > 3.1 > 2.5), preferring non-`preview` ids on a tie. Alternative: first/last item of the list as in SPEC.md, rejected because API order is not meaningful.
- **Low latency on Gemini:** try `thinkingLevel: 'MINIMAL'`; on HTTP 400 before any chunk retry without a thinking config and remember per model in a `Map`. Alternative: always omit the setting (it was fast in the test), rejected because the spec asks to minimise thinking where possible and slower models may think by default.
- **Caching:** the registry keeps `{ models, fetchedAt }` per provider for ten minutes; a failed fetch is cached for one minute so a dead API is not hammered. Fallback ids: Gemini `gemini-3.5-flash-lite`, `gemini-3.5-flash`; Claude `claude-haiku-5-5`, `claude-sonnet-5-5` (the newest ids known now; this differs from SPEC.md's `claude-haiku-4-5-20251001` and will be noted in the README).
- **Config is a pure function** `loadConfig(env)` returning the parsed config or throwing `ConfigError` with a Russian-free English message naming the variables; `index.ts` prints it and exits 1.
- **`validateStart`** is a pure async function over the registry; its error messages are Russian because they reach the user as `error` messages.

## Risks / Trade-offs

- [Name-based filtering may hide a new valid model or show an odd one] → `GEMINI_MODELS` / `ANTHROPIC_MODELS` override the list completely.
- [Default model listed but dead] → the user can pick another; sessions report `translation_error`.
- [Claude path untested against the live API] → fake-client tests plus a clearly labelled manual check once a key exists.
- [Model list API down at startup] → fallback ids, short negative cache.

## Migration Plan

Not applicable (new code). `.env.example` gets the override comments.

## Open Questions

None that change the specs or tasks.
