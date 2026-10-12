# Proposal

## Why

The UI needs solid ground before any screen is drawn: a model of what is on the screen (sentences, translations, hints, the live phrase), the remembered settings, a connection to the server that survives short outages, and capture of the call's audio. These parts are logic, not looks, so they can be built test-first and reused by any screen, including a later floating window.

## What Changes

- Add test tooling for the web app (jsdom, Testing Library) and a Vitest project for it.
- Add a pure reducer that turns server messages into the screen state: status, live phrase, sentence cards with streamed translation and hint, errors, rate-limit note.
- Add settings handling: defaults from the server config (translation = default fast model, hints = default strong model), saving only what SPEC.md section 5.1 lists in `localStorage`, tolerating broken storage and stale saved choices.
- Add a browser connection client: one WebSocket per call, first message `start`, up to five reconnects (0.5, 1, 2, 4, 8 s) with a fresh `start` each time, sentence ids shifted so cards from different server sessions never collide, a signal to restart the recorder after a reconnect.
- Add audio capture for a Chrome tab (with the "share tab audio" check and its error text) and for the microphone, using `MediaRecorder` with webm/opus in 250 ms chunks, restartable, stopping cleanly when the user ends sharing.
- Out of scope: screens and styling, hotkeys, the floating window, translation and hints on the server.

## Capabilities

### New Capabilities
- `call-state`: what the screen knows about a call, derived from server messages.
- `setup-settings`: the settings chosen before a call and which of them are remembered.
- `browser-connection`: the browser's WebSocket to the server, its start message, reconnecting and id handling.
- `audio-capture`: obtaining and chunking the call's audio in the browser.

### Modified Capabilities

## Impact

- New dev dependencies in `web`: `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.
- New files under `web/src/lib/` and a Vitest project entry in the root `vitest.config.ts`; root `npm test` keeps running everything.
