import { useEffect, useRef } from 'react';

// Keyboard shortcuts for the newest sentence: "1" = short hint, "2" = detailed hint.

interface Hotkeys {
  onShort(): void;
  onDetailed(): void;
}

// Keys pressed while typing must not trigger anything.
// (Not `instanceof HTMLElement`: an element of the floating window belongs to that window's own
// classes, so such a check would fail for it. We look at what the element is instead.)
function isTyping(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (typeof element?.tagName !== 'string') return false;
  // closest() also covers an element *inside* an editable area (and works in jsdom, which lacks isContentEditable)
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) ||
    element.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

/**
 * @param target the window whose keyboard to listen to: the page itself, or the floating
 * window when the call screen is shown there (a window only gets the keys pressed in it).
 */
export function useHotkeys(handlers: Hotkeys, target: Window = window): void {
  // A ref always holds the newest handlers, so the listener below does not need to be
  // re-created on every render and still calls the latest functions.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
      if (isTyping(event.target)) return;
      if (event.key === '1') latest.current.onShort();
      else if (event.key === '2') latest.current.onDetailed();
    }
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown); // cleanup when the target changes or the component goes away
  }, [target]);
}
