import { useEffect, useRef } from 'react';

// Keyboard shortcuts for the newest sentence: "1" = short hint, "2" = detailed hint.

interface Hotkeys {
  onShort(): void;
  onDetailed(): void;
}

// Keys pressed while typing must not trigger anything.
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // closest() also covers an element *inside* an editable area (and works in jsdom, which lacks isContentEditable)
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export function useHotkeys(handlers: Hotkeys): void {
  // A ref always holds the newest handlers, so the listener below can be added just once
  // and still call the latest functions (no need to re-subscribe on every render).
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
      if (isTyping(event.target)) return;
      if (event.key === '1') latest.current.onShort();
      else if (event.key === '2') latest.current.onDetailed();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown); // cleanup when the component unmounts
  }, []);
}
