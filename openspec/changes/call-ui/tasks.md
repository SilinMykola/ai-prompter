# Tasks

## 1. Call orchestration

- [x] 1.1 Write failing tests in `web/src/lib/callSession.test.ts` (fake capture, fake connection factory, recording dispatch) for: start errors passed on without opening a connection; no recording before the session is accepted; recording and chunk forwarding after the first ready signal; restart on `restart_recorder`; on a ready reconnect a `session_restarted` action and a recorder restart; reconnecting status during an outage; stop (capture released, connection stopped, stopped state); sharing ended in the browser; server-ended session; giving up; hint and retranslate pass-through; notices for unavailable cards; stop being safe twice; verify they fail
- [x] 1.2 Implement `startCall` in `web/src/lib/callSession.ts`; verify the tests pass
- [x] 1.3 Break the "start recording only when ready" rule and the release-on-end rule in turn, verify tests fail, restore

## 2. Setup screen

- [x] 2.1 Write failing component tests in `web/src/components/SetupScreen.test.tsx` for defaults, labels and placeholders, single provider as text, provider change resetting models, model lists, submit passing the current settings, error display with "Попробовать снова", and the form staying usable; verify they fail
- [x] 2.2 Implement `SetupScreen`; verify the tests pass
- [x] 2.3 Break the provider reset and the single-provider rule in turn, verify tests fail, restore

## 3. Call screen parts

- [x] 3.1 Write failing tests for `useHotkeys` (keys 1 and 2, ignored in fields, with modifiers, other keys) and for `isNearBottom` and `useAutoScroll` (follows at the bottom, stays when scrolled up, resumes at the bottom); verify they fail
- [x] 3.2 Implement `useHotkeys` and `useAutoScroll`; verify the tests pass
- [x] 3.3 Write failing tests for `SentenceCard` (original and translation, waiting indicator, failed translation with retry, hint buttons, hint block states, keycaps only when latest) and `LivePhrase`; verify they fail
- [x] 3.4 Implement `SentenceCard` and `LivePhrase`; verify the tests pass
- [ ] 3.5 Write failing tests for `CallScreen` (state labels, language/provider/model line, error line, stop button, cards in order, live phrase, hotkeys wired to the latest card, "Начать заново" after stop, notice line); verify they fail
- [ ] 3.6 Implement `CallScreen`; verify the tests pass
- [ ] 3.7 Break the hotkey field guard and the auto-scroll stop in turn, verify tests fail, restore

## 4. App and styles

- [ ] 4.1 Write failing tests for `App` (loading note, load failure with retry, form after loading with remembered settings, start passing the click to capture, call screen after success, setup error on capture failure, restart returning to the form), using a fake `fetch` and fake call starter; verify they fail
- [ ] 4.2 Implement `useCall` and `App`; verify the tests pass
- [ ] 4.3 Write `styles.css` for the design described in design.md (dark, 420 px safe, reduced motion); verify the build and typecheck pass
- [ ] 4.4 Render the screens at 420 px in a real browser if one is available, check there is no horizontal scroll and the hierarchy reads well, and fix what looks wrong

## 5. Wrap-up

- [ ] 5.1 Run `npm test`, `npm run typecheck` and `npm run build`; document the screens in the README; run the code-review skill on the new files and fix findings
