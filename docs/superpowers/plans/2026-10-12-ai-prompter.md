# AI Prompter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local web app that captures Chrome tab audio, shows live DE/EN transcription with Russian translation per sentence, and streams reply hints on demand.

**Architecture:** npm-workspaces monorepo (`shared/`, `server/`, `web/`). Browser sends webm/opus chunks over one WebSocket per session; the server bridges to Deepgram (`SttProvider`), assembles sentences with a pure module, and calls an `LlmProvider` (Gemini / Claude) for streamed translation and hints.

**Tech Stack:** TypeScript strict, Node 20+, Express, `ws`, `@google/genai`, `@anthropic-ai/sdk`, Vite, React 18 (function components + hooks only), Vitest, React Testing Library.

**Spec:** `SPEC.md` (repo root)

## Global Constraints

- TypeScript `strict: true` everywhere; React: function components and hooks only, no classes.
- No UI libraries, no state managers, plain CSS, system fonts, dark theme by default, works from 420px width.
- Server listens on `127.0.0.1` only (port 8787); Vite on 5175 proxies `/ws` and `/api`.
- API keys only on the server; never in `/api/config`.
- Nothing written to disk; server logs never contain transcript, translation, hint, context or profile text.
- "Мои данные" is never sent to the translation request.
- Code comments in English, explanatory (the author is learning React and will use this as a reference). Everything in the repo is in English except UI strings and server `error.message`, which are Russian per spec.
- No AI mentions in commits/files. Commit messages in English, one per task.
- `.env` in `.gitignore` from the first commit.
- Before coding STT/LLM parts, verify current Deepgram params, Gemini/Claude model IDs and Gemini SDK streaming/thinking-off against the docs; record deviations in README.
- TDD: every unit gets a failing test first; after it passes, break the behaviour once, see it fail, restore it (user rule).

## Review Focus

- Sentence assembler: Deepgram sends a final chunk ending mid-word/without punctuation, then `UtteranceEnd` with an empty buffer — must not emit an empty sentence.
- Abbreviation at end of buffer (`... z.B.`) followed later by more text — must not split early and must not lose the text.
- `hint` for an unknown `id`, or sent before `start` — server replies `error`/ignores, never crashes.
- `start` with provider lacking a key, or a model not in the list — `error` and session closed.
- Client WS drops while MediaRecorder runs — chunks are dropped/buffered without throwing; feed stays on screen.
- Hotkeys `1`/`2` while typing in a textarea must not trigger hints.
- Corrupt/blocked `localStorage` or stale saved provider/model — falls back to defaults silently.

---

## File Structure

```
package.json, tsconfig.base.json, .env.example, .gitignore, README.md
shared/protocol.ts                 message types (client<->server)
server/src/config.ts               env parsing + validation (pure: takes env object)
server/src/sentences.ts            SentenceAssembler (pure)
server/src/prompts.ts              translation/hint prompt builders (pure)
server/src/llm/{types,errors,gemini,anthropic,index}.ts
server/src/stt/{types,deepgram}.ts SttProvider + Deepgram bridge
server/src/session.ts              one WS session: wires STT, assembler, LLM
server/src/validateStart.ts        checks start message against registry (pure)
server/src/index.ts                Express + ws bootstrap
web/src/lib/{storage,audioCapture,wsClient,reducer}.ts
web/src/components/{Setup,CallScreen,SentenceCard,LiveCard,Header}.tsx
web/src/hooks/{useCallSession,useAutoScroll,useHotkeys}.ts
web/src/App.tsx, main.tsx, styles.css
```

Server tests: `server/src/**/*.test.ts` (Vitest, node). Web tests: `web/src/**/*.test.ts(x)` (Vitest + jsdom + RTL). The spec only requires tests for 6.2 and 7.1; web reducer/storage/hotkey tests are added because the user asked for broad TDD coverage.

---

### Task 1: Monorepo scaffold

**Files:** Create root `package.json` (workspaces `shared`, `server`, `web`; scripts `dev`, `build`, `start`, `test`), `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md` (skeleton), per-workspace `package.json` + `tsconfig.json`, `vitest` config.

- [ ] Step 1: `git init`, write `.gitignore` (`node_modules`, `dist`, `.env`) first.
- [ ] Step 2: Create workspaces; `dev` runs server (`tsx watch`) and Vite via `concurrently`.
- [ ] Step 3: Add a trivial smoke test in `server` (`expect(1+1).toBe(2)`), run `npm test` → PASS, then delete it once Task 3 exists.
- [ ] Step 4: Verify docs for model IDs; fill `.env.example` with real Gemini IDs.
- [ ] Step 5: Commit `chore: scaffold monorepo`.

### Task 2: Shared protocol

**Files:** Create `shared/protocol.ts`.

**Produces:** `ClientMessage` (`start|hint|retranslate|stop`), `ServerMessage` (all spec §8 types) as discriminated unions on `type`; `Language = 'de'|'en'|'multi'`; `HintMode = 'short'|'detailed'`; `ProviderId`; `ApiConfig`.

- [ ] Write types exactly per SPEC §8 and §3 (`ApiConfig`). Type-check via `tsc -b`. Commit `feat: shared WebSocket protocol types`.

### Task 3: Sentence assembler (TDD, spec §6.2)

**Files:** Create `server/src/sentences.ts`, Test `server/src/sentences.test.ts`.

**Produces:**
```ts
export interface SttResult { transcript: string; isFinal: boolean; speechFinal: boolean }
export interface Sentence { id: number; text: string }
// Factory with closure state, not a class (functional style):
export function createSentenceAssembler(): {
  pushResult(r: SttResult): { sentences: Sentence[]; finalText: string; interimText: string };
  pushUtteranceEnd(): { sentences: Sentence[]; finalText: string; interimText: string };
}
```
(Closure over state, no classes, consistent with the functional style.)

- [ ] Step 1: Write failing tests, one per spec case: two plain sentences; question mark; `3.5` not split; `12.10.2026` not split; `z.B.`, `Dr.`, `Nr.`, `bzw.`, `ca.`, `e.g.`, `Mr.`, `Mrs.` not split; `speech_final` flushes tail without punctuation; `UtteranceEnd` flushes; 350-char text with no boundary splits at last comma/space and each piece ≤300; empty and `"..."`/`" ."` input yields nothing; ids increase; interim result only updates `interimText`; `UtteranceEnd` with empty buffer emits nothing (Review Focus).
- [ ] Step 2: `npx vitest run server/src/sentences.test.ts` → FAIL (module missing).
- [ ] Step 3: Implement: buffer string; on final append with a space; `extractSentences` scans for `[.?!…]` followed by whitespace/end, skipping when the previous token is a known abbreviation (case-insensitive set) or the char before `.` and after are digits; trailing abbreviation at buffer end is kept; force-split >300 at last `,` or space.
- [ ] Step 4: Run → PASS. Mutation check: change the abbreviation set / digit rule, see the matching test fail, restore.
- [ ] Step 5: Commit `feat: sentence assembler with tests`.

### Task 4: Config + LLM registry + start validation (TDD, spec §3, §7.1)

**Files:** Create `server/src/config.ts`, `server/src/llm/{types,errors,index}.ts`, `server/src/validateStart.ts`; Tests `config.test.ts`, `llm/index.test.ts`, `validateStart.test.ts`.

**Produces:**
```ts
loadConfig(env: Record<string,string|undefined>): AppConfig   // throws ConfigError naming the missing variable
createRegistry(cfg, factories): { list(): ProviderInfo[]; get(id): LlmProvider|undefined; defaultId: ProviderId }
validateStart(msg: StartMessage, registry): { ok: true } | { ok: false; message: string }
class LlmError extends Error { kind: 'rate_limit'|'auth'|'timeout'|'other' }
```
(`LlmError` is the one class allowed: subclassing `Error` has no functional equivalent.)

- [ ] Tests first: missing `DEEPGRAM_API_KEY` throws naming it; no LLM key throws; provider without key not listed; `LLM_PROVIDER=anthropic` without key falls back to first available and records a warning; `/api/config` shape has no keys; `validateStart` rejects unavailable provider and unknown model; accepts valid (uses stub provider, no network).
- [ ] Run → FAIL; implement; run → PASS; mutation check on the fallback; commit `feat: config, provider registry, start validation`.

### Task 5: Prompts (TDD)

**Files:** Create `server/src/prompts.ts`, Test `prompts.test.ts`.

**Produces:** `buildTranslationRequest(ctx: {callContext: string; previous: string[]; sentence: string})`, `buildHintRequest(mode, ctx: {callContext; profile; previous: string[]; sentence})` returning `{system, user, maxTokens, temperature}`.

- [ ] Tests: translation `user` contains at most 4 previous sentences labelled "do not translate"; **never contains profile**; empty context becomes «не указан»; hint short maxTokens 200, detailed 500; hint includes profile and at most 6 previous. Fail → implement with spec §7.2/7.3 prompt text → pass → mutation (add profile to translation) → fail → restore. Commit.

### Task 6: LLM providers

**Files:** Create `server/src/llm/gemini.ts`, `server/src/llm/anthropic.ts`; Tests with the SDK client injected as a fake (`gemini.test.ts`, `anthropic.test.ts`).

- [ ] Each provider takes a client in its factory so tests feed a fake async stream. Tests: yields chunks in order; maps 429→`rate_limit`, 401/403→`auth`, abort/timeout→`timeout`, others→`other`; passes `signal`, `maxTokens`, `temperature`; Gemini disables thinking for models that allow it (verify the parameter in current docs).
- [ ] Fail → implement → pass → commit `feat: Gemini and Claude providers`.

### Task 7: STT bridge to Deepgram

**Files:** Create `server/src/stt/types.ts`, `server/src/stt/deepgram.ts`; Test `deepgram.test.ts` using a local `ws` server as a fake Deepgram.

**Produces:** `SttProvider.open(opts, handlers)` → `{ send(chunk), close() }`; handlers `onResult(SttResult)`, `onUtteranceEnd()`, `onSpeechStarted()`, `onReconnecting()`, `onFatal(err)`.

- [ ] Tests (fake WS server): URL contains required query params and auth header; chunks sent before open are buffered (≤5 s, drop oldest) then flushed; KeepAlive after 5 s silence (fake timers); `close()` sends `CloseStream`; unexpected close triggers reconnect 0.5→1→2→4→8 s and `onReconnecting`; give up after 5 tries → `onFatal`.
- [ ] Fail → implement → pass → commit.

### Task 8: Session + server bootstrap

**Files:** Create `server/src/session.ts`, `server/src/index.ts`; Test `session.test.ts` with stub STT + stub LLM.

**Behaviour:** first message must be `start` (validated, else `error` + close). STT results → assembler → `interim`/`sentence` messages. Each sentence triggers a parallel translation stream (`translation_delta/done`), retry once on error/10 s timeout, `rate_limit` retry after 2 s. `hint` aborts the previous hint for that `id` and streams `hint_start/delta/done`. `retranslate` re-runs. `stop`/WS close closes STT and drops all state. Logs: events, provider, model, durations only.

- [ ] Tests: sentence → ordered translation deltas; parallelism (second sentence translates while first is pending); retry then `translation_error`; second `hint` aborts the first; unknown `id` ignored; `hint` before `start` → `error`; **log spy asserts no transcript text** (criterion 13); `stop` closes STT.
- [ ] Fail → implement → pass → mutation (log the sentence) → fail → restore.
- [ ] Add Express: `GET /api/config`, static `web/dist` in prod, `ws` on `/ws`, bind `127.0.0.1`. Manual: `curl localhost:8787/api/config`. Commit.

### Task 9: Web — state, storage, protocol client (TDD)

**Files:** Create `web/src/lib/{reducer,storage,wsClient}.ts` + tests.

- [ ] `reducer`: pure `(state, ServerMessage) → state` handling interim, sentence, translation_delta/done/error, hint_*, status, error. Tests per message, deltas append, `hint_start` clears, hint replaced.
- [ ] `storage`: load/save with try/catch; throwing `localStorage` returns defaults; stale provider/model falls back; "Мои данные" persisted, call context not.
- [ ] `wsClient`: reconnect schedule 0.5→1→2→4→8 s, max 5, then `stopped` (fake timers + fake WebSocket).
- [ ] Fail → implement → pass → commit.

### Task 10: Web — audio capture + UI

**Files:** Create `web/src/lib/audioCapture.ts`, `web/src/hooks/{useCallSession,useAutoScroll,useHotkeys}.ts`, components and `styles.css`.

- [ ] `audioCapture` tests (mock `navigator.mediaDevices`): no audio tracks → stops all tracks, throws the Russian error from spec §5.2; `ended` on any track triggers callback; recorder gets only audio tracks, `audio/webm;codecs=opus`, timeslice 250; video track not stopped until session end.
- [ ] `useHotkeys` tests: `1`/`2` fire for last finished sentence; ignored in `textarea`/`input`.
- [ ] Component tests (RTL): Setup defaults (translation = first model, hints = last), provider reset on change, single provider shown as text; SentenceCard shows spinner until translation, "перевод не получен" + «повторить», hint buttons call back; autoscroll stops when scrolled up.
- [ ] Use the `frontend-design` skill for CSS: original ≥20px, translation lighter/different colour, live card interim in grey, layout OK at 420px, no modals/toasts; errors as a header line. Comment every hook and why it exists (learning reference).
- [ ] Handle `restart_recorder` by restarting MediaRecorder on the same stream.
- [ ] Commit per sub-feature.

### Task 11: Integration check and README

- [ ] `npm test`, `npm run build`, `npm start` smoke-test `/api/config`.
- [ ] Manual criteria (need real keys, done by the user): 2–5, 8–11. Check 7 by starting with only one key.
- [ ] README (English): five-step setup, key acquisition, architecture diagram, screenshot placeholder, "How to add a provider", "Known limitations", doc deviations.
- [ ] Run `code-review` on the whole diff, fix findings, commit.
