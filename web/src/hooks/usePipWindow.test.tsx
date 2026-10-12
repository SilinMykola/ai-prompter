import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePipWindow, type PipApi } from './usePipWindow';

// A stand-in for Chrome's floating window: a real (jsdom) window of an iframe, so that it has a document.
function fakeFloatingWindow() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const win = iframe.contentWindow!;
  win.close = vi.fn();
  return win;
}

function fakeApi(win = fakeFloatingWindow()) {
  const api: PipApi = { requestWindow: vi.fn(async () => win) };
  return { api, win };
}

const firePageHide = (win: Window) => win.dispatchEvent(new (win as typeof window).Event('pagehide'));

afterEach(() => {
  document.head.querySelectorAll('style').forEach((style) => style.remove());
  document.body.querySelectorAll('iframe').forEach((frame) => frame.remove());
});

describe('support', () => {
  it('is supported when the browser has the API', () => {
    const { result } = renderHook(() => usePipWindow(fakeApi().api));

    expect(result.current.supported).toBe(true);
    expect(result.current.container).toBeNull();
  });

  it('is not supported without the API', () => {
    const { result } = renderHook(() => usePipWindow(undefined));

    expect(result.current.supported).toBe(false);
  });

  it('does nothing when opened without support', () => {
    const { result } = renderHook(() => usePipWindow(undefined));

    expect(() => act(() => result.current.open())).not.toThrow();
    expect(result.current.container).toBeNull();
  });
});

describe('opening', () => {
  it('asks for a window 420 px wide at once, inside the click', () => {
    const { api } = fakeApi();
    const { result } = renderHook(() => usePipWindow(api));

    act(() => result.current.open());
    // No awaiting: the request must already have been made synchronously (browsers need the click for it).

    expect(api.requestWindow).toHaveBeenCalledTimes(1);
    expect(api.requestWindow).toHaveBeenCalledWith({ width: 420, height: 640 });
  });

  it('creates a container inside the new window', async () => {
    const { api, win } = fakeApi();
    const { result } = renderHook(() => usePipWindow(api));

    await act(async () => result.current.open());

    expect(result.current.window).toBe(win);
    expect(result.current.container).not.toBeNull();
    expect(win.document.body.contains(result.current.container)).toBe(true);
  });

  it('copies the page styles into the new window', async () => {
    const style = document.createElement('style');
    style.textContent = '.marker { color: red; }';
    document.head.append(style);
    const { api, win } = fakeApi();
    const { result } = renderHook(() => usePipWindow(api));

    await act(async () => result.current.open());

    const copied = [...win.document.head.querySelectorAll('style')].map((s) => s.textContent).join('');
    expect(copied).toContain('.marker');
  });

  it('links a style sheet whose rules cannot be read', async () => {
    const unreadable = {
      get cssRules(): CSSRuleList {
        throw new DOMException('blocked', 'SecurityError');
      },
      href: 'https://example.test/app.css',
      media: { mediaText: '' },
      type: 'text/css',
    };
    const original = Object.getOwnPropertyDescriptor(document, 'styleSheets');
    Object.defineProperty(document, 'styleSheets', { configurable: true, value: [unreadable] });
    try {
      const { api, win } = fakeApi();
      const { result } = renderHook(() => usePipWindow(api));

      await act(async () => result.current.open());

      const link = win.document.head.querySelector('link[rel="stylesheet"]');
      expect(link).toHaveAttribute('href', 'https://example.test/app.css');
    } finally {
      if (original) Object.defineProperty(document, 'styleSheets', original);
      else delete (document as { styleSheets?: unknown }).styleSheets;
    }
  });

  it('reuses the open window when asked again', async () => {
    const { api } = fakeApi();
    const { result } = renderHook(() => usePipWindow(api));
    await act(async () => result.current.open());

    await act(async () => result.current.open());

    expect(api.requestWindow).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal through `failed`, without throwing', async () => {
    const api: PipApi = { requestWindow: vi.fn(async () => Promise.reject(new DOMException('no gesture', 'NotAllowedError'))) };
    const { result } = renderHook(() => usePipWindow(api));

    await act(async () => result.current.open());

    expect(result.current.failed).toBe(true);
    expect(result.current.container).toBeNull();
  });

  it('forgets an earlier refusal on the next attempt', async () => {
    const win = fakeFloatingWindow();
    const requestWindow = vi.fn().mockRejectedValueOnce(new Error('no')).mockResolvedValue(win);
    const { result } = renderHook(() => usePipWindow({ requestWindow }));
    await act(async () => result.current.open());

    await act(async () => result.current.open());

    expect(result.current.failed).toBe(false);
    expect(result.current.container).not.toBeNull();
  });
});

describe('closing', () => {
  it('goes back to "no window" when the user closes the floating window', async () => {
    const { api, win } = fakeApi();
    const { result } = renderHook(() => usePipWindow(api));
    await act(async () => result.current.open());

    act(() => firePageHide(win));

    expect(result.current.window).toBeNull();
    expect(result.current.container).toBeNull();
  });

  it('closes the window on request and resets', async () => {
    const { api, win } = fakeApi();
    const { result } = renderHook(() => usePipWindow(api));
    await act(async () => result.current.open());

    act(() => result.current.close());

    expect(win.close).toHaveBeenCalledTimes(1);
    expect(result.current.window).toBeNull();
  });

  it('can be closed when nothing is open', () => {
    const { result } = renderHook(() => usePipWindow(fakeApi().api));

    expect(() => act(() => result.current.close())).not.toThrow();
  });

  it('closes the window when the component goes away', async () => {
    const { api, win } = fakeApi();
    const { result, unmount } = renderHook(() => usePipWindow(api));
    await act(async () => result.current.open());

    unmount();

    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it('closes a window that finished opening after the component went away', async () => {
    let resolve!: (win: Window) => void;
    const win = fakeFloatingWindow();
    const api: PipApi = { requestWindow: vi.fn(() => new Promise<Window>((r) => (resolve = r))) };
    const { result, unmount } = renderHook(() => usePipWindow(api));
    act(() => result.current.open());

    unmount();
    await act(async () => resolve(win));

    expect(win.close).toHaveBeenCalledTimes(1);
  });
});

describe('review fixes', () => {
  it('closes a window that finishes opening after close() was called', async () => {
    let resolve!: (win: Window) => void;
    const win = fakeFloatingWindow();
    const api: PipApi = { requestWindow: vi.fn(() => new Promise<Window>((r) => (resolve = r))) };
    const { result } = renderHook(() => usePipWindow(api));
    act(() => result.current.open());

    act(() => result.current.close()); // the user moved on while the browser was still opening it
    await act(async () => resolve(win));

    expect(win.close).toHaveBeenCalledTimes(1);
    expect(result.current.container).toBeNull();
  });

  it('can be opened again after a request was cancelled', async () => {
    let resolveFirst!: (win: Window) => void;
    const first = fakeFloatingWindow();
    const second = fakeFloatingWindow();
    const requestWindow = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Window>((r) => (resolveFirst = r)))
      .mockResolvedValue(second);
    const { result } = renderHook(() => usePipWindow({ requestWindow }));
    act(() => result.current.open());
    act(() => result.current.close());

    await act(async () => result.current.open());
    await act(async () => resolveFirst(first));

    expect(result.current.window).toBe(second);
    expect(first.close).toHaveBeenCalledTimes(1);
  });

  it('closes the window and reports a failure when setting it up goes wrong', async () => {
    const style = document.createElement('style');
    style.textContent = '.x { color: red; }'; // gives copyStyles something to copy
    document.head.append(style);
    const win = fakeFloatingWindow();
    Object.defineProperty(win.document, 'body', {
      configurable: true,
      get() {
        throw new Error('window is going away');
      },
    });
    const { result } = renderHook(() => usePipWindow({ requestWindow: async () => win }));

    await act(async () => result.current.open());

    expect(win.close).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(true);
    expect(result.current.container).toBeNull();
  });

  it('treats a window that is already closed when it arrives as a failure', async () => {
    const win = fakeFloatingWindow();
    Object.defineProperty(win, 'closed', { configurable: true, value: true });
    const { result } = renderHook(() => usePipWindow({ requestWindow: async () => win }));

    await act(async () => result.current.open());

    expect(result.current.failed).toBe(true);
    expect(result.current.container).toBeNull();
  });
});
