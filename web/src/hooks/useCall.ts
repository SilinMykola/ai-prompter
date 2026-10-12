import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { HintMode } from '@ai-prompter/shared/protocol';
import { createCapture } from '../lib/audioCapture';
import { callReducer, initialCallState, type CallState } from '../lib/callReducer';
import { startCall, type CallHandle } from '../lib/callSession';
import { createConnection } from '../lib/connection';
import type { Settings } from '../lib/settings';

// Connects the call orchestrator (plain code) to React: it keeps the screen state, the
// current call and the short notice, and hands the screen simple functions to call.

const NOTICE_MS = 4000;

export interface UseCall {
  state: CallState;
  notice: string | null;
  /**
   * Starts a call. Must be called directly from a click (the browser's share dialog needs
   * it). Rejects with the reason if audio could not be obtained.
   */
  begin(settings: Settings): Promise<void>;
  stop(): Promise<void>;
  requestHint(id: number, mode: HintMode): void;
  retranslate(id: number): void;
}

function socketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws`;
}

export function useCall(start: typeof startCall = startCall): UseCall {
  // useReducer = useState for state that changes by named actions (see callReducer.ts).
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const [notice, setNotice] = useState<string | null>(null);
  const handle = useRef<CallHandle | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  // Set when the component is gone, so a call that finishes starting later can be stopped at once.
  const disposed = useRef(false);

  const notify = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const stop = useCallback(async () => {
    await handle.current?.stop();
  }, []);

  // When the component goes away (the tab closes), end the call and clear the timer.
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      clearTimeout(noticeTimer.current);
      void handle.current?.stop();
    };
  }, []);

  const begin = useCallback(
    async (settings: Settings) => {
      // Not `await`ed before: `start` asks the browser for audio as its very first step.
      const call = start(settings, { dispatch, notify, createCapture, createConnection, url: socketUrl() });
      const started = await call;
      handle.current = started;
      // The page went away while the share dialog or the connection was still opening.
      if (disposed.current) await started.stop();
    },
    [start, notify],
  );

  return {
    state,
    notice,
    begin,
    stop,
    requestHint: (id, mode) => handle.current?.requestHint(id, mode),
    retranslate: (id) => handle.current?.retranslate(id),
  };
}
