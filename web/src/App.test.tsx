import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiConfig } from '@ai-prompter/shared/protocol';
import { App } from './App';
import { CaptureError } from './lib/audioCapture';
import type { CallDeps, CallHandle } from './lib/callSession';
import type { StorageLike } from './lib/settings';

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

function setup(options: { fetchConfig?: () => Promise<ApiConfig>; start?: (...args: any[]) => Promise<CallHandle>; stored?: Record<string, string> } = {}) {
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
  const { unmount } = render(<App fetchConfig={fetchConfig} start={start as never} storage={storage} />);
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
