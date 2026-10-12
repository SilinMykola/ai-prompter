import type { HintMode } from '@ai-prompter/shared/protocol';
import type { CallAction } from './callReducer';
import { CaptureError, type Capture, type createCapture } from './audioCapture';
import type { Connection, ConnectionOptions } from './connection';
import type { Settings } from './settings';

// Runs one call: connects the audio capture, the server connection and the screen state.
//
// This is a plain function (not a React hook) on purpose: a call is a sequence of events
// (accepted, restart, outage, end...) and a function with injected parts is much easier to
// test and to reason about than effects scattered over components.

export interface CallDeps {
  /** Changes the screen state (React's `dispatch` from `useReducer`). */
  dispatch(action: CallAction): void;
  /** Shows a short note that disappears by itself. */
  notify(text: string): void;
  createCapture: typeof createCapture;
  createConnection(options: ConnectionOptions): Connection;
  /** Address of the server's WebSocket, e.g. `ws://localhost:5175/ws`. */
  url: string;
}

export interface CallHandle {
  /** Ends the call and waits until the server has sent the last words. Safe to call twice. */
  stop(): Promise<void>;
  requestHint(id: number, mode: HintMode): void;
  retranslate(id: number): void;
}

/**
 * Starts a call. It must be called straight from the click on "Начать": the browser only
 * shows its share dialog for a user click, so asking for audio has to be the first thing done.
 * If audio cannot be obtained the returned promise rejects (and nothing else was started).
 */
export async function startCall(settings: Settings, deps: CallDeps): Promise<CallHandle> {
  const { dispatch } = deps;
  let ended = false; // the call is over (any reason): the sound is released
  let closed = false; // ...and the server connection is closed too: no more messages matter
  let stopPromise: Promise<void> | undefined;

  const capture: Capture = await deps.createCapture(settings.audioSource, {
    // The user clicked "Stop sharing" in the browser.
    onEnded: () => void handle.stop(),
  });

  dispatch({ type: 'reset' });
  dispatch({ type: 'status', state: 'connecting' });

  // Messages keep flowing while stopping: the last words of the call arrive then.
  const show = (action: CallAction) => {
    if (!closed) dispatch(action);
  };

  // The recorder can fail late (for example a browser without webm/opus): say so and end the call,
  // instead of sitting on "connecting" forever.
  function failCall(error: unknown): void {
    if (ended) return;
    dispatch({
      type: 'error',
      message: error instanceof CaptureError ? error.message : 'Не удалось запустить запись звука.',
    });
    endByItself();
  }

  // The end that was not asked for by the user: the server ended it, or we lost it for good.
  function endByItself(): void {
    if (ended) return;
    ended = true;
    capture.stop();
    connection.stop().catch(() => {}); // already over: a failure to close changes nothing
    closed = true;
    dispatch({ type: 'status', state: 'stopped' });
  }

  let connection!: Connection;
  try {
    connection = deps.createConnection({
      url: deps.url,
      start: {
        language: settings.language,
        provider: settings.provider,
        translationModel: settings.translationModel,
        hintModel: settings.hintModel,
        callContext: settings.callContext,
        profile: settings.profile,
      },
      onMessage(message) {
        if (message.type === 'restart_recorder') {
          try {
            capture.restart(); // the speech service needs a fresh recording header
          } catch (error) {
            failCall(error);
          }
          return;
        }
        show(message);
      },
      onSessionReady(isReconnect) {
        if (ended) return;
        try {
          if (isReconnect) {
            show({ type: 'session_restarted' });
            capture.restart();
          } else {
            // Only now: audio sent before the server accepted the session would be thrown away.
            capture.start((chunk) => connection.sendAudio(chunk));
          }
        } catch (error) {
          failCall(error);
        }
      },
      onReconnecting: () => show({ type: 'status', state: 'reconnecting' }),
      onGaveUp() {
        if (ended) return;
        dispatch({
          type: 'error',
          message: 'Нет связи с сервером. Нажмите «Начать заново».',
        });
        endByItself();
      },
      onCardUnavailable: () => {
        if (!ended) deps.notify('Эта реплика осталась в прошлом соединении — подсказка недоступна.');
      },
      onSessionEnded: endByItself,
    });
  } catch (error) {
    capture.stop(); // nothing was started, so the sharing indicator must go away too
    throw error;
  }

  const handle: CallHandle = {
    stop() {
      if (stopPromise) return stopPromise;
      ended = true;
      capture.stop(); // the browser's "sharing" indicator goes away at once
      stopPromise = connection
        .stop()
        .catch(() => {}) // even if closing fails, the call is over: the screen must say so
        .then(() => {
          closed = true;
          dispatch({ type: 'status', state: 'stopped' });
        });
      return stopPromise;
    },
    requestHint: (id, mode) => connection.requestHint(id, mode),
    retranslate: (id) => connection.retranslate(id),
  };
  return handle;
}
