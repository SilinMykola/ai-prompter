# Design

## Context

The call screen is a React component tree that already works from state and callbacks, so moving it to another window is a rendering question, not a logic one. Chrome (116+) offers `window.documentPictureInPicture.requestWindow({ width, height })`, which returns a `Window` with an empty document that Chrome keeps on top. It requires transient user activation (a click). React supports portals into other containers; for a container in another document React attaches its event listeners to that container, so clicks inside the floating window reach React handlers.

## Goals / Non-Goals

**Goals:**
- The call screen renders into the floating window with working controls and hotkeys, with minimal changes to existing components.
- The feature is invisible where unsupported.

**Non-Goals:**
- Moving the setup screen, remembering the window's position or size (Chrome does that), transparency.

## Decisions

- **`usePipWindow()` hook** returns `{ supported, container, open, close, failed }`: `supported` from `'documentPictureInPicture' in window`; `container` an element inside the floating window's body (or `null`); `open()` must be called synchronously from the click and calls `requestWindow` first thing. After the window exists it copies the page's styles into it, creates the container, and listens for the window's `pagehide` event (fired when the user closes it) to reset. The hook is the only place that knows the browser API; it takes the API object as a parameter (default `window.documentPictureInPicture`) so tests can pass a fake.
- **Copying styles:** for each stylesheet of the main document, copy its rules into a `<style>` element of the floating document; if the rules cannot be read (cross-origin) add a `<link>` with the same address. This is the approach in Chrome's documentation and works in both dev (Vite injects `<style>`) and production (a linked file on the same origin).
- **Rendering:** `createPortal(<CallScreen ... />, container)`. While the window is open, the main page renders a short note and a "Вернуть" button instead of the call screen, so one call screen exists at a time (two would double the hotkeys and the auto-scroll state).
- **Hotkeys:** `useHotkeys` gets an optional second parameter, the window to listen on (default: the main window). `CallScreen` takes an optional `hotkeyWindow`, which is the floating window when it is shown there. Alternative: listen on both windows always, rejected because it makes "which window has focus" ambiguous for the typing guard.
- **Lifetime:** the floating window is closed when the call screen goes away: on "Начать заново", on unmount, and when stopped (the button also disappears). The call itself lives in `useCall` in the main page, which is why closing the main page ends everything.
- **Error handling:** `requestWindow` can reject (no user activation, policy). The hook records the failure and `App` shows a short note, reusing the existing notice line; nothing else changes.
- **Window size:** 420 x 640. Chrome keeps the user's later size and position.
- **Styles for the container:** the container `div` gets the class `pip-root` with `height: 100%`, and the floating document's `html`/`body` get the same base rules through the copied sheet.

## Risks / Trade-offs

- [Chrome's floating window cannot be transparent or click-through] → the user positions it at a screen edge; documented.
- [The main page must stay open] → it can be minimised or in a background tab; capture and the connection keep running (timers may be throttled in a background tab, which can delay reconnect timing slightly).
- [Style copying runs once at open] → styles do not change at run time in this app, so a one-time copy is enough.
- [The API may change] → isolated in one hook with a fake in tests.

## Open Questions

None that change the specs or tasks.
