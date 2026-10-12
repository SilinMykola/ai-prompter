import type { HintMode } from '@ai-prompter/shared/protocol';
import type { Card } from '../lib/callReducer';

// One sentence of the other person: the original, its translation, and the hint buttons.

interface SentenceCardProps {
  card: Card;
  /** The newest card: the only one the keys 1 and 2 act on, so only it shows the keys. */
  isLatest: boolean;
  onHint(mode: HintMode): void;
  onRetranslate(): void;
}

const HINT_BUTTONS: Array<{ mode: HintMode; label: string; key: string }> = [
  { mode: 'short', label: 'Коротко', key: '1' },
  { mode: 'detailed', label: 'Подробно', key: '2' },
];

export function SentenceCard({ card, isLatest, onHint, onRetranslate }: SentenceCardProps) {
  const { translation, hint } = card;
  const waiting = translation.text === '' && translation.state !== 'error';

  return (
    <article className={isLatest ? 'entry entry--latest' : 'entry'}>
      <p className="entry__original">{card.text}</p>

      {waiting && <div className="entry__loading" role="status" aria-label="Перевод загружается" />}
      {translation.text !== '' && <p className="entry__translation">{translation.text}</p>}
      {translation.state === 'error' && (
        <p className="entry__failed">
          перевод не получен{' '}
          <button type="button" className="link-button" onClick={onRetranslate}>
            повторить
          </button>
        </p>
      )}

      <div className="entry__actions">
        {HINT_BUTTONS.map(({ mode, label, key }) => (
          <button
            key={mode}
            type="button"
            className="button button--hint"
            aria-pressed={hint?.mode === mode}
            aria-keyshortcuts={key}
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
