import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApiConfig } from '@ai-prompter/shared/protocol';
import { CallScreen } from './components/CallScreen';
import { SetupScreen } from './components/SetupScreen';
import { useCall } from './hooks/useCall';
import { usePipWindow, type PipApi } from './hooks/usePipWindow';
import { CaptureError } from './lib/audioCapture';
import type { startCall } from './lib/callSession';
import { resolveSettings, saveSettings, type Settings, type StorageLike } from './lib/settings';

// The whole app: it asks the server what is available, shows the setup form, then the call.
// Settings live here, so they survive going back to the form after a call.

interface AppProps {
  /** Loads the server's configuration. Replaceable in tests. */
  fetchConfig?: () => Promise<ApiConfig>;
  start?: typeof startCall;
  storage?: StorageLike | undefined;
  /** The browser's floating-window API. Replaceable in tests. */
  pipApi?: PipApi;
}

async function defaultFetchConfig(): Promise<ApiConfig> {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error(`config request failed: ${response.status}`);
  return response.json();
}

// localStorage can throw (for example when the browser blocks site data), even just to look at it.
function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

type Phase = 'loading' | 'load-failed' | 'setup' | 'call';

export function App({ fetchConfig = defaultFetchConfig, start, storage = browserStorage(), pipApi }: AppProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // A ref (not state) because two quick clicks can happen before React re-renders.
  const startingNow = useRef(false);
  const call = useCall(start);
  const pip = usePipWindow(pipApi);

  const loadConfig = useCallback(() => {
    setPhase('loading');
    fetchConfig().then(
      (loaded) => {
        setConfig(loaded);
        setSettings(resolveSettings(loaded, storage));
        setPhase('setup');
      },
      () => setPhase('load-failed'),
    );
  }, [fetchConfig, storage]);

  // Load the configuration once, when the app first appears.
  useEffect(loadConfig, [loadConfig]);

  function handleStart(chosen: Settings) {
    if (startingNow.current) return; // a double click must not open two captures
    startingNow.current = true;
    setStarting(true);
    setStartError(null);
    saveSettings(chosen, storage);
    // `call.begin` runs synchronously up to the browser's share dialog: it is still "inside the click".
    call
      .begin(chosen)
      .then(
        () => setPhase('call'),
        (error: unknown) =>
          setStartError(error instanceof CaptureError ? error.message : 'Не удалось начать звонок. Попробуйте снова.'),
      )
      .finally(() => {
        startingNow.current = false;
        setStarting(false);
      });
  }

  if (phase === 'loading') {
    return <p className="message">Загружаю настройки…</p>;
  }

  if (phase === 'load-failed' || !config || !settings) {
    return (
      <div className="message">
        <p>Сервер не отвечает. Проверьте, что он запущен (npm run dev), и повторите.</p>
        <button type="button" className="button button--primary" onClick={loadConfig}>
          Повторить
        </button>
      </div>
    );
  }

  if (phase === 'call') {
    const screen = (
      <CallScreen
        state={call.state}
        settings={settings}
        // The refusal comes first: a click that seems to do nothing is worse than a missed hint note.
        notice={pip.failed ? 'Не удалось открыть окно поверх окон. Нажмите кнопку ещё раз.' : call.notice}
        onStop={() => void call.stop()}
        onRestart={() => {
          pip.close(); // the floating window must not outlive the call screen
          setPhase('setup');
        }}
        onHint={call.requestHint}
        onRetranslate={call.retranslate}
        onPopOut={pip.supported ? pip.open : undefined}
        hotkeyWindow={pip.window ?? undefined}
      />
    );

    // While the floating window is open the call screen is drawn there (a "portal" renders React
    // content into another element, here one inside the other window). Only one screen exists,
    // so keys and scrolling are never doubled; the main page shows a note with a way back.
    if (pip.container) {
      return (
        <>
          <div className="message pip-note">
            <p>Окно суфлёра вынесено поверх окон. Звонок продолжается.</p>
            <button type="button" className="button button--primary" onClick={pip.close}>
              Вернуть
            </button>
          </div>
          {createPortal(screen, pip.container)}
        </>
      );
    }
    return screen;
  }

  return <SetupScreen config={config} settings={settings} onChange={setSettings} onStart={handleStart} error={startError} starting={starting} />;
}
