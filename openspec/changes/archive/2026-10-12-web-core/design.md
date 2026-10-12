# Design

## Context

The server already speaks the protocol in `shared/protocol.ts`. The web app is a bare placeholder. SPEC.md sections 5.1 to 5.4 describe the behaviour; this change builds the non-visual parts. Nothing here needs a real browser to test: the browser APIs are passed in, so tests use fakes.

## Goals / Non-Goals

**Goals:**
- Pure and injected pieces that are easy to test and read as React learning material (a reducer, plain functions, no classes).
- One place where ids from different server sessions are reconciled.

**Non-Goals:**
- Screens, CSS, hotkeys, auto-scroll, the floating window.

## Decisions

- **Reducer, not a store library.** `callReducer(state, action)` is a plain function used with React's `useReducer` later; it also takes two local actions (`session_restarted`, `reset`). Alternative: external state managers, excluded by SPEC.md.
- **Card model:** `{ id, text, translation: { text, state: 'waiting' | 'streaming' | 'done' | 'error' }, hint: null | { mode, text, state: 'streaming' | 'done' | 'error' } }`.
- **Settings as pure functions over an injected `Storage`-like object:** `resolveSettings(config, storage)` and `saveSettings(settings, storage)`; the profile is stored, the call context never. A single key `ai-prompter.settings` holds one JSON object. Invalid parts are dropped one by one, not all or nothing.
- **Connection client as a closure (`createConnection`)** with injected `WebSocket` constructor and timer functions. It owns: the socket, retry count, `idOffset`, and the highest id seen. After a reconnect `idOffset` becomes the highest id seen so far; incoming ids are `serverId + idOffset`, outgoing `hint`/`retranslate` ids are `cardId - idOffset` and are refused (with a callback) when that is not positive. This is the only place that knows about offsets, so the reducer stays simple.
- **Retry schedule is reset when a connection stayed open for 5 seconds** (same rule as the server's Deepgram client), because a quiet call sends few messages.
- **Orderly stop:** send `stop`, wait up to two seconds for the server to close, then close the socket and never retry.
- **Audio capture API:** `createCapture(source, deps)` resolves to `{ start(onChunk), restart(), stop() }` and takes `onEnded` in options. Browser APIs (`getDisplayMedia`, `getUserMedia`, `MediaRecorder`, `MediaStream`) come from `deps` and default to the globals. Chunks are converted with `blob.arrayBuffer()` in order (a queue keeps order even though `arrayBuffer()` is asynchronous).
- **Local audio keeps playing:** no `suppressLocalAudioPlayback` is requested, so the user still hears the call.
- **Test setup:** a `web` Vitest project with `jsdom`; Testing Library comes in for the screens change, but is installed now together with the environment so later changes only add tests.

## Risks / Trade-offs

- [`MediaRecorder` chunks after `restart()` may still contain data from the old recorder for a moment] → the server drops chunks until it sees a webm header, so this is harmless.
- [Offsetting ids hides the server's real ids from the UI] → intended; the UI never needs them.
- [A browser that lacks `audio/webm;codecs=opus`] → capture fails with a clear message; Chrome, the only supported browser, has it.

## Open Questions

None that change the specs or tasks.
