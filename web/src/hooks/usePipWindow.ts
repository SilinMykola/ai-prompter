import { useCallback, useEffect, useRef, useState } from 'react';

// A floating window that stays above all other windows (Chrome's "Document Picture-in-Picture").
// The call screen is drawn into it with a React portal, so it can sit over the video call.
// Docs: https://developer.chrome.com/docs/web-platform/document-picture-in-picture

/** The one method of Chrome's `window.documentPictureInPicture` that we use. */
export interface PipApi {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

export interface UsePipWindow {
  /** The browser can open such a window. */
  supported: boolean;
  /** The floating window, while it is open. */
  window: Window | null;
  /** An element inside the floating window's page: render into it with `createPortal`. */
  container: HTMLElement | null;
  /** The browser refused to open the window (for example without a user click). */
  failed: boolean;
  /** Must be called straight from a click: browsers only allow the window after a user action. */
  open(): void;
  close(): void;
}

const WIDTH = 420;
const HEIGHT = 640;

// The floating window starts with an empty page. Give it the same styles as ours.
function copyStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const style = to.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      to.head.append(style);
    } catch {
      // Rules of a sheet from another origin cannot be read: link to the file instead.
      if (!sheet.href) continue;
      const link = to.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      link.media = sheet.media?.mediaText ?? '';
      to.head.append(link);
    }
  }
}

function browserApi(): PipApi | undefined {
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
}

export function usePipWindow(api: PipApi | undefined = browserApi()): UsePipWindow {
  const [pip, setPip] = useState<{ window: Window; container: HTMLElement } | null>(null);
  const [failed, setFailed] = useState(false);
  // Refs hold what the callbacks below need to know without re-creating them on every change.
  const current = useRef<Window | null>(null);
  const requesting = useRef(false);
  const gone = useRef(false); // the component was removed

  const close = useCallback(() => {
    const win = current.current;
    current.current = null;
    setPip(null);
    win?.close();
  }, []);

  const open = useCallback(() => {
    if (!api || current.current || requesting.current) return; // unsupported, or already open
    requesting.current = true;
    setFailed(false);
    // First thing, synchronously: the request has to happen inside the click.
    api.requestWindow({ width: WIDTH, height: HEIGHT }).then(
      (win) => {
        requesting.current = false;
        if (gone.current) {
          win.close(); // the page left while the window was opening
          return;
        }
        copyStyles(document, win.document);
        win.document.title = document.title;
        const container = win.document.createElement('div');
        container.className = 'pip-root';
        win.document.body.append(container);
        // "pagehide" fires when the user closes the floating window.
        win.addEventListener('pagehide', () => {
          if (current.current === win) {
            current.current = null;
            setPip(null);
          }
        });
        current.current = win;
        setPip({ window: win, container });
      },
      () => {
        requesting.current = false;
        setFailed(true);
      },
    );
  }, [api]);

  // When the component goes away, take the floating window with it.
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      current.current?.close();
      current.current = null;
    };
  }, []);

  return { supported: api !== undefined, window: pip?.window ?? null, container: pip?.container ?? null, failed, open, close };
}
