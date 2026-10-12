# Tasks

## 1. Test setup for the web app

- [ ] 1.1 Install `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` in `web`; add a `web` project (jsdom environment, setup file with jest-dom matchers) to the root `vitest.config.ts`; add a trivial failing test, see it fail, make it pass, delete it; verify `npm test` runs the web project

## 2. Call state reducer

- [ ] 2.1 Write failing tests in `web/src/lib/callReducer.test.ts` for status, live phrase, new sentence, duplicate id, translation deltas/done/error/retry, unknown card, hint start/delta/done/error and replacement, server error, latest card, and `session_restarted` keeping cards but resetting live state; verify they fail
- [ ] 2.2 Implement `callReducer`, `initialCallState`, `latestCard` in `web/src/lib/callReducer.ts` with explanatory comments; verify the tests pass
- [ ] 2.3 Break the duplicate-id rule and the retry replacement in turn, verify tests fail, restore

## 3. Settings

- [ ] 3.1 Write failing tests in `web/src/lib/settings.test.ts` for defaults, remembered fields, the context never being stored, stale provider and stale model fallbacks, provider switch resetting models, throwing storage, invalid JSON and wrong types, and failing writes; verify they fail
- [ ] 3.2 Implement `resolveSettings`, `saveSettings`, `changeProvider` in `web/src/lib/settings.ts`; verify the tests pass
- [ ] 3.3 Break the "context is never stored" rule and the stale-model fallback in turn, verify tests fail, restore

## 4. Connection client

- [ ] 4.1 Write failing tests in `web/src/lib/connection.test.ts` (fake WebSocket, fake timers) for `start` first, audio dropped when not open, reconnect schedule, new `start` after a reconnect, giving up, schedule reset after a stable connection, id shifting both ways, a request for an old card, orderly stop with and without a server answer, no reconnect after stop, message order, and server errors passed on; verify they fail
- [ ] 4.2 Implement `createConnection` in `web/src/lib/connection.ts`; verify the tests pass
- [ ] 4.3 Break the id offset and the retry limit in turn, verify tests fail, restore

## 5. Audio capture

- [ ] 5.1 Write failing tests in `web/src/lib/audioCapture.test.ts` (fake `getDisplayMedia`, `getUserMedia`, `MediaRecorder`, `MediaStream`) for audio present and absent, audio-only recorder input with the video track left running, recorder options and 250 ms slice, ordered chunk delivery, restart, microphone source, single `onEnded`, clean idempotent stop, and permission errors; verify they fail
- [ ] 5.2 Implement `createCapture` in `web/src/lib/audioCapture.ts`; verify the tests pass
- [ ] 5.3 Break the no-audio check and the video-track rule in turn, verify tests fail, restore

## 6. Wrap-up

- [ ] 6.1 Run `npm test` and `npm run typecheck`; run the code-review skill on the new files; fix findings; verify both commands pass again
