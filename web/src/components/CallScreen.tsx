import { useRef } from 'react';
import type { HintMode, ProviderId } from '@ai-prompter/shared/protocol';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useHotkeys } from '../hooks/useHotkeys';
import { groupParagraphs, latestCard, type CallState } from '../lib/callReducer';
import type { Settings } from '../lib/settings';
import { LivePhrase } from './LivePhrase';
import { ParagraphCard } from './ParagraphCard';

// The screen during a call: a header with the state of the call, a scrolling feed of
// paragraphs, and the phrase being spoken right now at the bottom.

interface CallScreenProps {
  state: CallState;
  settings: Pick<Settings, 'language' | 'provider' | 'translationModel'>;
  /** A short note that goes away by itself (for example "this card is no longer available"). */
  notice: string | null;
  onStop(): void;
  /** Back to the setup form. */
  onRestart(): void;
  onHint(id: number, mode: HintMode): void;
  onRetranslate(id: number): void;
  /** Moves this screen into a floating window. Omitted where the browser cannot do it. */
  onPopOut?(): void;
  /** The window this screen is shown in, when it is not the main page (hotkeys are heard there). */
  hotkeyWindow?: Window;
}

const STATUS_LABELS: Record<CallState['status'], string> = {
  idle: 'подключение…',
  connecting: 'подключение…',
  listening: 'слушаю',
  speaking: 'собеседник говорит',
  reconnecting: 'переподключение…',
  stopped: 'остановлено',
};

const LANGUAGE_LABELS: Record<Settings['language'], string> = {
  de: 'Немецкий',
  en: 'Английский',
  multi: 'Авто (DE+EN)',
};

const PROVIDER_LABELS: Record<ProviderId, string> = { gemini: 'Gemini', anthropic: 'Claude' };

export function CallScreen({
  state,
  settings,
  notice,
  onStop,
  onRestart,
  onHint,
  onRetranslate,
  onPopOut,
  hotkeyWindow,
}: CallScreenProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  // Re-run the scrolling whenever the cards or the live phrase change.
  useAutoScroll(feedRef, state);

  const stopped = state.status === 'stopped';

  const latest = latestCard(state);
  // After the end nobody listens any more: the keys must not send requests into the void.
  useHotkeys(
    {
      onShort: () => latest && !stopped && onHint(latest.id, 'short'),
      onDetailed: () => latest && !stopped && onHint(latest.id, 'detailed'),
    },
    hotkeyWindow,
  );

  const showInvitation = !stopped && state.cards.length === 0 && !state.finalText && !state.interimText;

  return (
    <div className="call">
      <header className="call__header">
        <div className="call__bar">
          <p className="call__status" data-testid="call-status" data-state={state.status}>
            <span className="call__status-dot" aria-hidden="true" />
            {STATUS_LABELS[state.status]}
          </p>
          <div className="call__actions">
            {onPopOut && !stopped && (
              <button type="button" className="button" onClick={onPopOut}>
                Вынести поверх окон
              </button>
            )}
            {stopped ? (
              <button type="button" className="button button--primary" onClick={onRestart}>
                Начать заново
              </button>
            ) : (
              <button type="button" className="button" onClick={onStop}>
                Стоп
              </button>
            )}
          </div>
        </div>
        <p className="call__summary" data-testid="call-summary">
          <span>{LANGUAGE_LABELS[settings.language]}</span>
          <span>{PROVIDER_LABELS[settings.provider]}</span>
          <span>{settings.translationModel}</span>
        </p>
        {state.error && (
          <p className="call__error" role="alert">
            {state.error}
          </p>
        )}
        {notice && (
          <p className="call__notice" role="status" aria-label="Заметка">
            {notice}
          </p>
        )}
      </header>

      <div className="feed" ref={feedRef}>
        {showInvitation && <p className="feed__empty">Жду речь собеседника…</p>}
        {groupParagraphs(state.cards).map((cards) => (
          <ParagraphCard
            key={cards[0].id}
            cards={cards}
            isLatest={cards.some((card) => card.id === latest?.id)}
            disabled={stopped}
            onHint={(mode) => onHint(cards[cards.length - 1].id, mode)}
            onRetranslate={onRetranslate}
          />
        ))}
        <LivePhrase
          finalText={state.finalText}
          interimText={state.interimText}
          speaking={state.status === 'speaking'}
        />
      </div>
    </div>
  );
}
