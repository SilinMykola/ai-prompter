import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialCallState, type Card, type CallState } from '../lib/callReducer';
import { CallScreen } from './CallScreen';

const card = (id: number, change: Partial<Card> = {}): Card => ({
  id,
  paragraph: id, // every card is a paragraph of its own unless a test says otherwise
  text: `Satz ${id}.`,
  translation: { text: `Предложение ${id}.`, state: 'done' },
  hint: null,
  ...change,
});

function setup(state: Partial<CallState> = {}, notice: string | null = null, extra: Partial<React.ComponentProps<typeof CallScreen>> = {}) {
  const handlers = { onStop: vi.fn(), onRestart: vi.fn(), onHint: vi.fn(), onRetranslate: vi.fn() };
  render(
    <CallScreen
      state={{ ...initialCallState, status: 'listening', ...state }}
      settings={{ language: 'de', provider: 'gemini', translationModel: 'gemini-3.5-flash-lite' }}
      notice={notice}
      {...handlers}
      {...extra}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

describe('header', () => {
  it.each([
    ['connecting', 'подключение…'],
    ['listening', 'слушаю'],
    ['speaking', 'собеседник говорит'],
    ['reconnecting', 'переподключение…'],
    ['stopped', 'остановлено'],
  ] as const)('shows "%s" as "%s"', (status, label) => {
    setup({ status });

    expect(screen.getByTestId('call-status')).toHaveTextContent(label);
  });

  it('shows "подключение…" before the first status arrives', () => {
    setup({ status: 'idle' });

    expect(screen.getByTestId('call-status')).toHaveTextContent('подключение…');
  });

  it('shows the language, provider and translation model in small text', () => {
    setup();

    const summary = screen.getByTestId('call-summary');
    expect(summary).toHaveTextContent('Немецкий');
    expect(summary).toHaveTextContent('Gemini');
    expect(summary).toHaveTextContent('gemini-3.5-flash-lite');
  });

  it('shows an error as text in the header, not in a dialog', () => {
    setup({ error: 'Сервис распознавания речи отклонил ключ API.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Сервис распознавания речи отклонил ключ API.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows no error line when there is no error', () => {
    setup();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a short notice when there is one', () => {
    setup({}, 'Эта реплика осталась в прошлом соединении.');

    expect(screen.getByRole('status', { name: 'Заметка' })).toHaveTextContent('Эта реплика осталась в прошлом соединении.');
  });

  it('has a stop button while the call runs', async () => {
    const { user, onStop } = setup();

    await user.click(screen.getByRole('button', { name: 'Стоп' }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('after the call stopped', () => {
  it('keeps the cards and offers "Начать заново" instead of "Стоп"', async () => {
    const { user, onRestart } = setup({ status: 'stopped', cards: [card(1)] });

    expect(screen.queryByRole('button', { name: 'Стоп' })).not.toBeInTheDocument();
    expect(screen.getByText('Satz 1.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Начать заново' }));

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('does not offer "Начать заново" while the call runs', () => {
    setup({ status: 'listening' });

    expect(screen.queryByRole('button', { name: 'Начать заново' })).not.toBeInTheDocument();
  });
});

describe('feed', () => {
  it('shows the cards in order of arrival', () => {
    setup({ cards: [card(1), card(2), card(3)] });

    const originals = screen.getAllByText(/^Satz \d\.$/).map((el) => el.textContent);
    expect(originals).toEqual(['Satz 1.', 'Satz 2.', 'Satz 3.']);
  });

  it('shows sentences of one paragraph together, with one pair of hint buttons per paragraph', () => {
    setup({ cards: [card(1, { paragraph: 1 }), card(2, { paragraph: 1 }), card(3, { paragraph: 2 })] });

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Коротко' })).toHaveLength(2);
  });

  it('asks for a hint on the last sentence of the paragraph', async () => {
    const { user, onHint } = setup({ cards: [card(1, { paragraph: 1 }), card(2, { paragraph: 1 })] });

    await user.click(screen.getByRole('button', { name: 'Коротко' }));

    expect(onHint).toHaveBeenCalledWith(2, 'short');
  });

  it('shows the live phrase after the cards', () => {
    setup({ cards: [card(1)], finalText: 'Wie geht', interimText: 'es' });

    expect(screen.getByText('Wie geht')).toBeInTheDocument();
    expect(screen.getByText('es')).toHaveClass('live__guess');
  });

  it('invites the user to wait when nothing was said yet', () => {
    setup();

    expect(screen.getByText('Жду речь собеседника…')).toBeInTheDocument();
  });

  it('does not show the invitation once there are cards or after the end', () => {
    setup({ status: 'stopped' });

    expect(screen.queryByText('Жду речь собеседника…')).not.toBeInTheDocument();
  });

  it('shows the hotkeys on the latest card only', () => {
    setup({ cards: [card(1), card(2)] });

    expect(screen.getAllByText('1')).toHaveLength(1);
    expect(within(screen.getAllByRole('article')[1]).getByText('1')).toBeInTheDocument();
  });
});

describe('requests', () => {
  it('asks for a hint for the card whose button was pressed', async () => {
    const { user, onHint } = setup({ cards: [card(1), card(2)] });

    await user.click(within(screen.getAllByRole('article')[0]).getByRole('button', { name: 'Подробно' }));

    expect(onHint).toHaveBeenCalledWith(1, 'detailed');
  });

  it('asks for the translation again for the card whose retry was pressed', async () => {
    const { user, onRetranslate } = setup({ cards: [card(1), card(2, { translation: { text: '', state: 'error' } })] });

    await user.click(screen.getByRole('button', { name: 'повторить' }));

    expect(onRetranslate).toHaveBeenCalledWith(2);
  });

  it('"1" and "2" ask for hints for the latest card', () => {
    const { onHint } = setup({ cards: [card(1), card(7)] });

    fireEvent.keyDown(document.body, { key: '1' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(onHint.mock.calls).toEqual([
      [7, 'short'],
      [7, 'detailed'],
    ]);
  });

  it('the keys do nothing when there is no card yet', () => {
    const { onHint } = setup();

    fireEvent.keyDown(document.body, { key: '1' });

    expect(onHint).not.toHaveBeenCalled();
  });
});

describe('after the call stopped: no more requests', () => {
  it('the keys do nothing', () => {
    const { onHint } = setup({ status: 'stopped', cards: [card(1)] });

    fireEvent.keyDown(document.body, { key: '1' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(onHint).not.toHaveBeenCalled();
  });

  it('the hint buttons are disabled', () => {
    setup({ status: 'stopped', cards: [card(1)] });

    expect(screen.getByRole('button', { name: 'Коротко' })).toBeDisabled();
  });
});

describe('the floating window button', () => {
  it('is shown when the app can open one, and asks for it when pressed', async () => {
    const onPopOut = vi.fn();
    const { user } = setup({}, null, { onPopOut });

    await user.click(screen.getByRole('button', { name: 'Вынести поверх окон' }));

    expect(onPopOut).toHaveBeenCalledTimes(1);
  });

  it('is not shown when the app cannot open one', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Вынести поверх окон' })).not.toBeInTheDocument();
  });

  it('is not shown after the call stopped', () => {
    setup({ status: 'stopped' }, null, { onPopOut: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Вынести поверх окон' })).not.toBeInTheDocument();
  });
});

describe('hotkeys of a call screen shown in another window', () => {
  it('listens in the given window', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const win = iframe.contentWindow!;
    const { onHint } = setup({ cards: [card(4)] }, null, { hotkeyWindow: win });

    fireEvent.keyDown(document.body, { key: '1' });
    expect(onHint).not.toHaveBeenCalled();
    fireEvent.keyDown(win.document.body, { key: '2' });

    expect(onHint).toHaveBeenCalledWith(4, 'detailed');
  });
});
