import type { HintMode } from '@ai-prompter/shared/protocol';
import type { Card } from '../lib/callReducer';

// One paragraph of the other person (up to five sentences): the original on the left, its
// translation on the right, then the hint buttons and the hint. On a narrow screen the two
// columns stack. The translation is requested per sentence, but shown as one continuous text.

interface ParagraphCardProps {
  /** The sentences of this paragraph, in the order they were said. Never empty. */
  cards: Card[];
  /** The newest paragraph: the only one the keys 1 and 2 act on, so only it shows the keys. */
  isLatest: boolean;
  /** The call is over: nobody can answer requests any more. */
  disabled?: boolean;
  /** A hint is asked for the last sentence of the paragraph: that is what was said most recently. */
  onHint(mode: HintMode): void;
  onRetranslate(id: number): void;
}

const HINT_BUTTONS: Array<{ mode: HintMode; label: string; key: string }> = [
  { mode: 'short', label: 'Коротко', key: '1' },
  { mode: 'detailed', label: 'Подробно', key: '2' },
];

export function ParagraphCard({ cards, isLatest, disabled = false, onHint, onRetranslate }: ParagraphCardProps) {
  // The indicator belongs to a translation that is still coming. A finished one is never "loading".
  const waiting = cards.some(
    ({ translation }) => translation.state === 'waiting' || (translation.state === 'streaming' && translation.text === ''),
  );
  const failed = cards.filter(({ translation }) => translation.state === 'error');
  // The hint that was asked for last (usually there is one, on the last sentence).
  const hint = [...cards].reverse().find((card) => card.hint)?.hint ?? null;

  return (
    <article className={isLatest ? 'paragraph paragraph--latest' : 'paragraph'}>
      <div className="paragraph__columns">
        <p className="paragraph__original">
          {cards.map((card, index) => (
            <span key={card.id}>
              {index > 0 && ' '}
              {card.text}
            </span>
          ))}
        </p>

        <div className="paragraph__translation">
          {cards.some((card) => card.translation.text !== '') && (
            <p className="paragraph__translation-text">
              {cards
                .filter((card) => card.translation.text !== '')
                .map((card, index) => (
                  <span key={card.id}>
                    {index > 0 && ' '}
                    {card.translation.text}
                  </span>
                ))}
            </p>
          )}
          {waiting && <div className="entry__loading" role="status" aria-label="Перевод загружается" />}
          {failed.map((card) => (
            <p key={card.id} className="entry__failed">
              перевод не получен{' '}
              {!disabled && (
                <button type="button" className="link-button" onClick={() => onRetranslate(card.id)}>
                  повторить
                </button>
              )}
            </p>
          ))}
        </div>
      </div>

      <div className="entry__actions">
        {HINT_BUTTONS.map(({ mode, label, key }) => (
          <button
            key={mode}
            type="button"
            className="button button--hint"
            aria-pressed={hint?.mode === mode}
            aria-keyshortcuts={key}
            disabled={disabled}
            onClick={() => onHint(mode)}
          >
            {label}
            {isLatest && (
              <kbd className="keycap" aria-hidden="true">
                {key}
              </kbd>
            )}
          </button>
        ))}
      </div>

      {hint && (
        <div className="entry__hint" data-testid="hint" data-state={hint.state}>
          {hint.text !== '' && <p className="entry__hint-text">{hint.text}</p>}
          {hint.text === '' && hint.state !== 'error' && (
            <div className="entry__loading" role="status" aria-label="Подсказка загружается" />
          )}
          {hint.state === 'error' && <p className="entry__failed">подсказка не получена</p>}
        </div>
      )}
    </article>
  );
}
