import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiConfig } from '@ai-prompter/shared/protocol';
import { App } from './App';
import { CaptureError } from './lib/audioCapture';
import type { CallDeps, CallHandle } from './lib/callSession';
import type { StorageLike } from './lib/settings';
import type { PipApi } from './hooks/usePipWindow';

const config: ApiConfig = {
  defaultProvider: 'gemini',
  providers: [
    { id: 'gemini', label: 'Gemini', models: ['g-fast', 'g-strong'], defaultTranslationModel: 'g-fast', defaultHintModel: 'g-strong' },
  ],
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  return { storage, data };
}

function fakeHandle() {
  return { stop: vi.fn(async () => {}), requestHint: vi.fn(), retranslate: vi.fn() } satisfies CallHandle;
}

function setup(options: { fetchConfig?: () => Promise<ApiConfig>; start?: (...args: any[]) => Promise<CallHandle>; stored?: Record<string, string>; pip?: PipApi } = {}) {
  const { storage, data } = memoryStorage(options.stored);
  const handle = fakeHandle();
  let deps: CallDeps | undefined;
  const start = vi.fn(
    options.start ??
      (async (_settings: unknown, callDeps: CallDeps) => {
        deps = callDeps;
        return handle;
      }),
  );
  const fetchConfig = options.fetchConfig ?? vi.fn(async () => config);
  const { unmount } = render(<App fetchConfig={fetchConfig} start={start as never} storage={storage} pipApi={options.pip} />);
  return { unmount, start, handle, data, fetchConfig, user: userEvent.setup(), get deps() { return deps!; } };
}

describe('loading the configuration', () => {
  it('shows a loading note, then the setup form', async () => {
    setup();

    expect(screen.getByText('Загружаю настройки…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Начать' })).toBeInTheDocument();
    expect(screen.queryByText('Загружаю настройки…')).not.toBeInTheDocument();
  });

  it('explains when the server does not answer, and tries again on request', async () => {
    const fetchConfig = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(config);
    const { user } = setup({ fetchConfig });

    expect(await screen.findByText(/Сервер не отвечает/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('button', { name: 'Начать' })).toBeInTheDocument();
    expect(fetchConfig).toHaveBeenCalledTimes(2);
  });

  it('starts the form with remembered choices', async () => {
    setup({ stored: { 'ai-prompter.settings': JSON.stringify({ language: 'en', profile: 'Ich bin Test' }) } });

    expect(await screen.findByRole('radio', { name: 'Английский' })).toBeChecked();
    expect(screen.getByLabelText('Мои данные')).toHaveValue('Ich bin Test');
    expect(screen.getByLabelText('Контекст звонка')).toHaveValue('');
  });
});

describe('starting a call', () => {
  it('asks for audio inside the click itself (the browser needs a user gesture)', async () => {
    const { start } = setup();
    const button = await screen.findByRole('button', { name: 'Начать' });

    fireEvent.click(button);
    // No awaiting here on purpose: the call must have been started synchronously by the click.

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('starts with the chosen settings and remembers them, except the call context', async () => {
    const { start, data, user } = setup();
    await user.click(await screen.findByRole('radio', { name: 'Микрофон' }));
    await user.type(screen.getByLabelText('Контекст звонка'), 'Arzttermin');
    await user.type(screen.getByLabelText('Мои данные'), 'Name: Test');

    await user.click(screen.getByRole('button', { name: 'Начать' }));

    expect(start.mock.calls[0][0]).toMatchObject({ audioSource: 'mic', callContext: 'Arzttermin', profile: 'Name: Test' });
    expect(data.get('ai-prompter.settings')).toContain('Name: Test');
    expect(data.get('ai-prompter.settings')).not.toContain('Arzttermin');
  });

  it('shows the call screen once audio was obtained', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Начать' }));

    expect(await screen.findByRole('button', { name: 'Стоп' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Начать' })).not.toBeInTheDocument();
  });

  it('keeps the form and explains the reason when audio could not be obtained', async () => {
    const { user } = setup({
      start: async () => {
        throw new CaptureError('Звук не захвачен. Выберите вкладку Chrome.');
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Начать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Звук не захвачен. Выберите вкладку Chrome.');
    expect(screen.getByRole('button', { name: 'Попробовать снова' })).toBeInTheDocument();
  });

  it('gives a general message for other failures', async () => {
    const { user } = setup({
      start: async () => {
        throw new Error('weird');
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Начать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось начать звонок');
  });
});

describe('during and after a call', () => {
  it('shows what the call reports', async () => {
    const view = setup();
    await view.user.click(await screen.findByRole('button', { name: 'Начать' }));
    await screen.findByRole('button', { name: 'Стоп' });

    act(() => {
      view.deps.dispatch({ type: 'status', state: 'speaking' });
      view.deps.dispatch({ type: 'sentence', id: 1, text: 'Guten Tag.' });
    });

    expect(screen.getByTestId('call-status')).toHaveTextContent('собеседник говорит');
    expect(screen.getByText('Guten Tag.')).toBeInTheDocument();
  });

  it('passes stop, hint and retranslate to the call', async () => {
    const view = setup();
    await view.user.click(await screen.findByRole('button', { name: 'Начать' }));
    await screen.findByRole('button', { name: 'Стоп' });
    act(() => view.deps.dispatch({ type: 'sentence', id: 5, text: 'Frage?' }));

    await view.user.click(screen.getByRole('button', { name: 'Коротко' }));
    await view.user.click(screen.getByRole('button', { name: 'Стоп' }));

    expect(view.handle.requestHint).toHaveBeenCalledWith(5, 'short');
    expect(view.handle.stop).toHaveBeenCalledTimes(1);
  });

  it('shows a short notice from the call and removes it after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const view = setup();
      await view.user.click(await screen.findByRole('button', { name: 'Начать' }));
      await screen.findByRole('button', { name: 'Стоп' });

      act(() => view.deps.notify('Подсказка недоступна.'));
      expect(screen.getByText('Подсказка недоступна.')).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(4100));

      expect(screen.queryByText('Подсказка недоступна.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns to the form with the earlier choices after "Начать заново"', async () => {
    const view = setup();
    await view.user.click(await screen.findByRole('radio', { name: 'Английский' }));
    await view.user.click(screen.getByRole('button', { name: 'Начать' }));
    await screen.findByRole('button', { name: 'Стоп' });
    act(() => view.deps.dispatch({ type: 'status', state: 'stopped' }));

    await view.user.click(screen.getByRole('button', { name: 'Начать заново' }));

    expect(await screen.findByRole('button', { name: 'Начать' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Английский' })).toBeChecked();
  });

  it('stops the call when the page goes away', async () => {
    const view = setup();
    await view.user.click(await screen.findByRole('button', { name: 'Начать' }));
    await screen.findByRole('button', { name: 'Стоп' });

    view.unmount();

    expect(view.handle.stop).toHaveBeenCalledTimes(1);
  });
});

describe('review fixes', () => {
  it('starts only one call when the button is pressed twice quickly', async () => {
    let finish!: (handle: CallHandle) => void;
    const view = setup({ start: () => new Promise<CallHandle>((resolve) => (finish = resolve)) });
    const button = await screen.findByRole('button', { name: 'Начать' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(view.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Запускаю…' })).toBeDisabled();
    await act(async () => finish(view.handle));
    expect(await screen.findByRole('button', { name: 'Стоп' })).toBeInTheDocument();
  });

  it('allows another try after a failed start', async () => {
    const start = vi.fn().mockRejectedValueOnce(new CaptureError('Звук не захвачен.')).mockResolvedValue(fakeHandle());
    const view = setup({ start });

    await view.user.click(await screen.findByRole('button', { name: 'Начать' }));
    await view.user.click(await screen.findByRole('button', { name: 'Попробовать снова' }));

    expect(start).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('button', { name: 'Стоп' })).toBeInTheDocument();
  });

  it('stops a call that finishes starting after the page went away', async () => {
    let finish!: (handle: CallHandle) => void;
    const view = setup({ start: () => new Promise<CallHandle>((resolve) => (finish = resolve)) });
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));

    view.unmount();
    await act(async () => finish(view.handle));

    expect(view.handle.stop).toHaveBeenCalledTimes(1);
  });
});

// --- the floating window ---

// A stand-in for Chrome's floating window: the window of an iframe, so that it has its own document.
function fakeFloating() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const win = iframe.contentWindow!;
  win.close = vi.fn();
  const api: PipApi = { requestWindow: vi.fn(async () => win) };
  const hide = () => win.dispatchEvent(new (win as typeof window).Event('pagehide'));
  return { api, win, hide, inside: () => within(win.document.body) };
}

async function callRunning(pip?: PipApi) {
  const view = setup({ pip });
  await view.user.click(await screen.findByRole('button', { name: 'Начать' }));
  await screen.findByRole('button', { name: 'Стоп' });
  return view;
}

describe('the floating window', () => {
  it('offers the button only when the browser supports it', async () => {
    await callRunning(fakeFloating().api);
    expect(screen.getByRole('button', { name: 'Вынести поверх окон' })).toBeInTheDocument();
  });

  it('does not offer it otherwise', async () => {
    await callRunning(undefined);
    expect(screen.queryByRole('button', { name: 'Вынести поверх окон' })).not.toBeInTheDocument();
  });

  it('asks for the window inside the click', async () => {
    const floating = fakeFloating();
    await callRunning(floating.api);

    fireEvent.click(screen.getByRole('button', { name: 'Вынести поверх окон' }));

    expect(floating.api.requestWindow).toHaveBeenCalledTimes(1);
  });

  async function popOut() {
    const floating = fakeFloating();
    const view = await callRunning(floating.api);
    act(() => view.deps.dispatch({ type: 'sentence', id: 1, text: 'Guten Tag.' }));
    await view.user.click(screen.getByRole('button', { name: 'Вынести поверх окон' }));
    await screen.findByRole('button', { name: 'Вернуть' });
    return { ...view, ...floating };
  }

  it('moves the call screen into the floating window and leaves a note in the main page', async () => {
    const { inside } = await popOut();

    expect(inside().getByText('Guten Tag.')).toBeInTheDocument();
    expect(inside().getByRole('button', { name: 'Стоп' })).toBeInTheDocument();
    expect(screen.queryByText('Guten Tag.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вернуть' })).toBeInTheDocument();
  });

  it('shows only one call screen at a time', async () => {
    const { inside } = await popOut();

    expect(screen.queryAllByTestId('call-status')).toHaveLength(0);
    expect(inside().getAllByTestId('call-status')).toHaveLength(1);
  });

  it('keeps the call running: new sentences appear in the floating window', async () => {
    const { inside, deps } = await popOut();

    act(() => deps.dispatch({ type: 'sentence', id: 2, text: 'Wie geht es Ihnen?' }));

    expect(inside().getByText('Wie geht es Ihnen?')).toBeInTheDocument();
  });

  it('lets the hint buttons work inside the floating window', async () => {
    const { inside, handle } = await popOut();

    fireEvent.click(inside().getByRole('button', { name: 'Коротко' }));

    expect(handle.requestHint).toHaveBeenCalledWith(1, 'short');
  });

  it('hears the keys 1 and 2 pressed in the floating window, not in the main page', async () => {
    const { win, handle } = await popOut();

    fireEvent.keyDown(document.body, { key: '1' });
    expect(handle.requestHint).not.toHaveBeenCalled();
    fireEvent.keyDown(win.document.body, { key: '2' });

    expect(handle.requestHint).toHaveBeenCalledWith(1, 'detailed');
  });

  it('brings the call screen back, with its sentences, when the user closes the floating window', async () => {
    const { hide } = await popOut();

    act(() => hide());

    expect(await screen.findByText('Guten Tag.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вернуть' })).not.toBeInTheDocument();
  });

  it('brings it back and closes the window on "Вернуть"', async () => {
    const { user, win } = await popOut();

    await user.click(screen.getByRole('button', { name: 'Вернуть' }));

    expect(win.close).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Guten Tag.')).toBeInTheDocument();
  });

  it('keeps the call screen in the main page and says so when the browser refuses', async () => {
    const api: PipApi = { requestWindow: vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError'))) };
    const view = await callRunning(api);

    await view.user.click(screen.getByRole('button', { name: 'Вынести поверх окон' }));

    expect(await screen.findByText(/Не удалось открыть окно/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стоп' })).toBeInTheDocument();
  });

  it('closes the floating window when going back to the setup form', async () => {
    const { win, deps, inside } = await popOut();
    act(() => deps.dispatch({ type: 'status', state: 'stopped' }));

    fireEvent.click(await within(win.document.body).findByRole('button', { name: 'Начать заново' }));

    expect(win.close).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Начать' })).toBeInTheDocument();
    void inside;
  });

  it('stays open after the call stopped, so the last sentences can still be read', async () => {
    const { win, deps, inside } = await popOut();

    act(() => deps.dispatch({ type: 'status', state: 'stopped' }));

    expect(win.close).not.toHaveBeenCalled();
    expect(inside().getByText('Guten Tag.')).toBeInTheDocument();
  });

  it('closes the floating window when the page goes away', async () => {
    const { win, unmount } = await popOut();

    unmount();

    expect(win.close).toHaveBeenCalledTimes(1);
  });
});
