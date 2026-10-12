# Design

## Context

Web core pieces exist and are tested: `callReducer`, `settings`, `createConnection`, `createCapture`. The screens are a thin layer over them. Constraints that shape the design: the share dialog may only be opened from a user click; the window will be narrow (420 px) and read at a glance during a conversation; no external fonts or scripts; React 18 with function components and hooks only.

## Goals / Non-Goals

**Goals:**
- Keep logic out of components: a plain `startCall` function orchestrates, components only render and call back.
- Visual identity suited to the job: a prompter read from the corner of the eye.

**Non-Goals:**
- Floating window, translation/hint production, light theme.

## Decisions

- **`startCall(settings, deps)` in `lib/callSession.ts`**, returns `{ stop, requestHint, retranslate }`. It does the capture/connection wiring (recorder starts at the first ready signal; `restart_recorder` and reconnect call `restart()`; every end path calls one `release()`). Dependencies are injected, so tests use fakes. Alternative: put this in a hook with effects, rejected because effects are hard to test and to reason about for a sequence of events.
- **Hook `useCall`** wraps it for React: `useReducer(callReducer)` for state, a ref for the handle, `begin(settings)` (async, throws the capture error to the caller), `stop()`, and a transient `notice` string cleared after 4 seconds.
- **The click must start capture.** `SetupScreen` calls `onStart(settings)`; `App.handleStart` calls `begin` synchronously inside the click handler, whose first action is `createCapture`, so the browser still sees a user gesture.
- **Phases in `App`:** `loading | load-failed | setup | call`. Settings live in `App` state; they are saved when a call starts.
- **Components:** `SetupScreen`, `CallScreen` (header, feed, live phrase), `SentenceCard`, `LivePhrase`; hooks `useAutoScroll(ref, deps)` and `useHotkeys(handlers)`. Small and single-purpose.
- **Auto-scroll:** the hook records whether the feed is near the bottom (within 40 px) on every scroll event; after content changes it scrolls to the bottom only if it was. Pure function `isNearBottom` is unit tested; the DOM part is tested with jsdom by setting scroll properties.
- **Hotkeys:** one `keydown` listener on `window`; ignores events with modifier keys or when the target is an `input`, `textarea`, `select` or content-editable element.
- **Visual language:** a deep ink-blue background (`#0e131c`) with slightly lighter paper-like surfaces for the header; the original in a book serif (system stack: `ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif`) at 22 px in warm white (`#f1eee6`), the translation in the system sans at 17 px in muted teal (`#7fc8bd`), hints behind a thin amber rule (`#e3a93b`) as the single accent used for actions, keys and hints, errors in a warm red (`#ff7b6b`). No boxed cards or shadows: entries are separated by space and a hairline; the newest entry is slightly brighter. The memorable element is the live phrase at the bottom: its status dot "breathes" while the other person speaks (motion only on that one element, switched off for `prefers-reduced-motion`). Keycaps `1` / `2` appear only on the newest entry, because only it answers the keys.
- **Language of the UI** is Russian as the spec requires; code and comments are English.
- **Narrow layout:** a single column with `min-width: 0` everywhere and long words allowed to wrap, so nothing overflows at 420 px; the feed is the only scroll area, the header and live phrase stay in view.

## Risks / Trade-offs

- [Browser capture and the share dialog cannot be exercised in automated tests] → covered by fakes in unit tests and a manual check with a real browser (listed in the tasks).
- [A serif for the original text may look unusual in a tool] → chosen on purpose: it separates "what they said" from "what the app says" without colour alone.
- [Hotkey `1`/`2` could collide with page shortcuts of the video call] → they only fire when this window has focus.

## Open Questions

None that change the specs or tasks.
