# Tasks

## 1. The floating-window hook

- [ ] 1.1 Write failing tests in `web/src/hooks/usePipWindow.test.tsx` (a fake `documentPictureInPicture` returning an iframe's window) for `supported` true and false, `open()` calling `requestWindow` with a width of 420 at once, a container created inside the new window, the page's `<style>` rules copied (and a `<link>` for an unreadable sheet), `pagehide` resetting the state, `close()` closing the window and resetting, a rejected request being reported through `failed` without throwing, and opening twice reusing the open window; verify they fail
- [ ] 1.2 Implement `usePipWindow` in `web/src/hooks/usePipWindow.ts`; verify the tests pass
- [ ] 1.3 Break the style copying and the `pagehide` handling in turn, verify tests fail, restore

## 2. Hotkeys and the call screen

- [ ] 2.1 Write failing tests that `useHotkeys` listens on a given window when one is passed (keys pressed in that window act, keys in the main window do not) and still guards against typing there; verify they fail
- [ ] 2.2 Add the optional window parameter to `useHotkeys` and the optional `hotkeyWindow` and `onPopOut` props to `CallScreen`; write failing tests that the button "Вынести поверх окон" appears only with `onPopOut` and not after stopping, and calls it; implement; verify all pass
- [ ] 2.3 Break the stopped-call rule for the button and the window parameter in turn, verify tests fail, restore

## 3. App integration

- [ ] 3.1 Write failing tests in `web/src/App.test.tsx` (fake PiP API with an iframe window) for the button being offered only when supported, opening from the click, the call screen appearing inside the floating window while the main page shows the note and "Вернуть", hint buttons and `1`/`2` working inside the floating window, new sentences appearing there, closing the window and "Вернуть" bringing the screen back with all sentences, a refused window showing a note, and the window closing on "Начать заново", on stop and on unmount; verify they fail
- [ ] 3.2 Implement the integration in `web/src/App.tsx`, the note and container styles in `web/src/styles.css`; verify the tests pass
- [ ] 3.3 Break the cleanup on restart and the single-screen rule in turn, verify tests fail, restore

## 4. Wrap-up

- [ ] 4.1 Render the floating arrangement check: with a real Chrome (headless is enough to verify that the API exists and the portal renders into a second document if possible), otherwise state clearly what could only be checked by tests; document the feature and its limits in the README and update SPEC.md section 11
- [ ] 4.2 Run `npm test`, `npm run typecheck`, `npm run build` and the code-review skill; fix findings
