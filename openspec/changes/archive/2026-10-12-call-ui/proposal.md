# Proposal

## Why

The server and the browser's logic are ready, but there is nothing to look at or click. The user needs the two screens from SPEC.md sections 5.1 and 5.3: set up a call, then read the other person's sentences as they come, in a window small enough to sit next to the video call. With this change the app can be used for real for the first time: live transcription works end to end, translation and hints will appear in the same cards as soon as the server produces them.

## What Changes

- A setup screen: audio source, call language, provider, translation and hint models, call context, "my data", and a start button; remembered choices are restored; failures to load the server config or to get audio are explained on the screen.
- A call screen: a header with the state of the call, the chosen language, provider and model, a stop button and the error line; a feed of sentence cards with the original large, the translation under it, hint buttons and a hint block; a live card for the unfinished phrase; automatic scrolling that stops when the user scrolls up; hotkeys `1` and `2` for the latest card.
- A call orchestrator that connects the pieces: audio capture, the server connection and the screen state. The recorder starts only when the server has accepted the session, restarts after a reconnect or on the server's request, and everything is released on stop, on a server-ended session or when the user stops sharing.
- Visual design: dark, readable at a glance, comfortable from 420 px width, system fonts only.
- Out of scope: the floating window over other windows (a later change), translation and hints on the server (cards show their waiting state until then), any modal windows or pop-up notices.

## Capabilities

### New Capabilities
- `setup-screen`: what the user sees and chooses before a call.
- `call-screen`: what the user sees and can do during a call.
- `call-orchestration`: how audio capture, the server connection and the screen state work together for one call.

### Modified Capabilities

## Impact

- New files under `web/src/` (`App.tsx`, `components/`, `hooks/`, `lib/callSession.ts`) and a rewritten `styles.css`; tests with Testing Library.
- No server changes, no new runtime dependencies.
