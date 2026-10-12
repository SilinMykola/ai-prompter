# Proposal

## Why

The app is meant to sit next to, or on top of, the video call. A normal browser window gets covered the moment the user clicks into the call. Chrome's Document Picture-in-Picture API opens a small window that Chrome keeps above all other windows, and it can show any web content, so the whole call screen (sentences, translations, hints, the stop button) can float over the call. This was an explicit wish of the user and was listed as out of scope in SPEC.md section 11; it is now brought in.

## What Changes

- A button on the call screen, "Вынести поверх окон", opens a floating window (420 px wide) and moves the call screen into it; it is shown only in browsers that support the feature.
- The main page then shows a short note and a "Вернуть" button; the call itself (audio capture, server connection, state) keeps running in the main page, only the display moves.
- The floating window gets the app's styles, shows exactly the same call screen, and the buttons, scrolling and the hotkeys `1` / `2` work inside it.
- Closing the floating window, or pressing "Вернуть", puts the call screen back into the main page; stopping the call, going back to the setup form or closing the page closes the floating window.
- If the browser refuses to open the window, the page keeps working as before and says so briefly.
- Documentation in the README, and SPEC.md section 11 is updated.
- Out of scope: transparency or click-through (browsers do not allow them), resizing logic, other browsers than Chrome.

## Capabilities

### New Capabilities
- `floating-window`: showing the call screen in a window that stays above other windows.

### Modified Capabilities

## Impact

- New files: `web/src/hooks/usePipWindow.ts` and tests; `web/src/components/CallScreen.tsx`, `web/src/hooks/useHotkeys.ts`, `web/src/App.tsx` and `styles.css` change.
- No server changes, no new dependencies.
- The call must keep running in the main page: it must stay open (it may be minimised or in the background).
