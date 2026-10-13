import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Card } from '../lib/callReducer';
import { ParagraphCard } from './ParagraphCard';

const card = (change: Partial<Card> = {}): Card => ({
  id: 1,
  paragraph: 1,
  text: 'Guten Tag, wie kann ich helfen?',
  translation: { text: '', state: 'waiting' },
  hint: null,
  ...change,
});

function setup(cardData: Card | Card[], isLatest = false, disabled = false) {
  const onHint = vi.fn();
  const onRetranslate = vi.fn();
  const cards = Array.isArray(cardData) ? cardData : [cardData];
  render(<ParagraphCard cards={cards} isLatest={isLatest} disabled={disabled} onHint={onHint} onRetranslate={onRetranslate} />);
  return { onHint, onRetranslate, user: userEvent.setup() };
}

describe('ParagraphCard', () => {
  it('shows the original and the translation', () => {
    setup(card({ translation: { text: 'Добрый день, чем могу помочь?', state: 'done' } }));

    expect(screen.getByText('Guten Tag, wie kann ich helfen?')).toBeInTheDocument();
    expect(screen.getByText('Добрый день, чем могу помочь?')).toBeInTheDocument();
  });

  it('shows a loading indicator while the translation has not arrived', () => {
    setup(card({ translation: { text: '', state: 'waiting' } }));

    expect(screen.getByRole('status', { name: 'Перевод загружается' })).toBeInTheDocument();
  });

  it('shows the text so far, without the indicator, while the translation streams', () => {
    setup(card({ translation: { text: 'Добрый', state: 'streaming' } }));

    expect(screen.getByText('Добрый')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Перевод загружается' })).not.toBeInTheDocument();
  });

  it('shows "перевод не получен" with a retry button when the translation failed', async () => {
    const { user, onRetranslate } = setup(card({ translation: { text: '', state: 'error' } }));

    expect(screen.getByText('перевод не получен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'повторить' }));

    expect(onRetranslate).toHaveBeenCalledWith(1);
  });

  it('keeps the partial text visible when the translation failed halfway', () => {
    setup(card({ translation: { text: 'Добрый', state: 'error' } }));

    expect(screen.getByText('Добрый')).toBeInTheDocument();
    expect(screen.getByText('перевод не получен')).toBeInTheDocument();
  });

  it('requests a short or a detailed hint with its two buttons', async () => {
    const { user, onHint } = setup(card());

    await user.click(screen.getByRole('button', { name: 'Коротко' }));
    await user.click(screen.getByRole('button', { name: 'Подробно' }));

    expect(onHint.mock.calls).toEqual([['short'], ['detailed']]);
  });

  it('shows the streamed hint in a block under the translation', () => {
    setup(card({ hint: { mode: 'short', text: 'Ja, gern.\nДа, конечно.', state: 'done' } }));

    expect(screen.getByTestId('hint')).toHaveTextContent('Ja, gern.');
    expect(screen.getByTestId('hint')).toHaveTextContent('Да, конечно.');
  });

  it('shows a loading indicator in the hint block before the first words', () => {
    setup(card({ hint: { mode: 'detailed', text: '', state: 'streaming' } }));

    expect(screen.getByRole('status', { name: 'Подсказка загружается' })).toBeInTheDocument();
  });

  it('says "подсказка не получена" when the hint failed', () => {
    setup(card({ hint: { mode: 'short', text: '', state: 'error' } }));

    expect(screen.getByText('подсказка не получена')).toBeInTheDocument();
  });

  it('keeps the partial hint and says it failed when it broke off halfway', () => {
    setup(card({ hint: { mode: 'short', text: 'Ja, ger', state: 'error' } }));

    expect(screen.getByText('Ja, ger')).toBeInTheDocument();
    expect(screen.getByText('подсказка не получена')).toBeInTheDocument();
  });

  it('marks which kind of hint is shown', () => {
    setup(card({ hint: { mode: 'detailed', text: 'x', state: 'done' } }));

    expect(screen.getByRole('button', { name: 'Подробно' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Коротко' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the hotkeys only on the latest card, without changing the button names', () => {
    setup(card(), true);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Коротко' })).toHaveAttribute('aria-keyshortcuts', '1');
  });

  it('shows no hotkeys on older cards', () => {
    setup(card(), false);

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });
});

describe('review fixes', () => {
  it('does not show a loading indicator for a finished translation that is empty', () => {
    setup(card({ translation: { text: '', state: 'done' } }));

    expect(screen.queryByRole('status', { name: 'Перевод загружается' })).not.toBeInTheDocument();
  });

  it('disables the hint buttons and hides the retry when the call is over', () => {
    setup(card({ translation: { text: '', state: 'error' } }), true, true);

    expect(screen.getByRole('button', { name: 'Коротко' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Подробно' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'повторить' })).not.toBeInTheDocument();
    expect(screen.getByText('перевод не получен')).toBeInTheDocument();
  });
});

describe('several sentences in one paragraph', () => {
  const two = [
    card({ id: 1, text: 'Guten Tag.', translation: { text: 'Добрый день.', state: 'done' } }),
    card({ id: 2, text: 'Wie kann ich helfen?', translation: { text: 'Чем могу помочь?', state: 'done' } }),
  ];

  it('shows the originals and the translations each as one continuous text', () => {
    setup(two);

    expect(screen.getByText('Guten Tag.').parentElement).toHaveTextContent('Guten Tag. Wie kann ich helfen?');
    expect(screen.getByText('Добрый день.').parentElement).toHaveTextContent('Добрый день. Чем могу помочь?');
  });

  it('keeps the translation of a sentence that is ready while the next one is still coming', () => {
    setup([two[0], card({ id: 2, translation: { text: '', state: 'waiting' } })]);

    expect(screen.getByText('Добрый день.')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Перевод загружается' })).toBeInTheDocument();
  });

  it('retries only the sentence whose translation failed', async () => {
    const { user, onRetranslate } = setup([two[0], card({ id: 2, translation: { text: '', state: 'error' } })]);

    await user.click(screen.getByRole('button', { name: 'повторить' }));

    expect(onRetranslate).toHaveBeenCalledWith(2);
  });

  it('shows the hint that was asked for on any sentence of the paragraph', () => {
    setup([card({ id: 1, hint: { mode: 'short', text: 'Ja, gern.', state: 'done' } }), card({ id: 2 })]);

    expect(screen.getByTestId('hint')).toHaveTextContent('Ja, gern.');
    expect(screen.getByRole('button', { name: 'Коротко' })).toHaveAttribute('aria-pressed', 'true');
  });
});
