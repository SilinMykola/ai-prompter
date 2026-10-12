import type { HintMode, ServerMessage, SessionState } from '@ai-prompter/shared/protocol';

// The state of the call screen, and the one function that changes it.
//
// A "reducer" is a plain function `(state, action) => newState`. It never changes the old
// state; it returns a new object. React's `useReducer` calls it for every action and
// re-renders when the result is different. Because it is pure (no network, no timers),
// it is easy to test: give it a list of actions and look at the result.

/** `waiting`: sentence is there, translation has not started. */
export type TranslationState = 'waiting' | 'streaming' | 'done' | 'error';
export type HintState = 'streaming' | 'done' | 'error';

/** One sentence of the other person, with its translation and (optional) reply hint. */
export interface Card {
  id: number;
  text: string;
  translation: { text: string; state: TranslationState };
  hint: null | { mode: HintMode; text: string; state: HintState };
}

export interface CallState {
  /** `idle` before anything was reported. */
  status: SessionState | 'idle';
  /** The live phrase: confirmed part... */
  finalText: string;
  /** ...and the part that may still change (shown in grey). */
  interimText: string;
  cards: Card[];
  /** Text of the last error from the server; stays until the next session. */
  error: string | null;
}

/** Everything the reducer understands: server messages plus two local events. */
export type CallAction =
  | ServerMessage
  /** The connection was restored and a new server session began. */
  | { type: 'session_restarted' }
  | { type: 'reset' };

export const initialCallState: CallState = {
  status: 'idle',
  finalText: '',
  interimText: '',
  cards: [],
  error: null,
};

/** The newest card: the target of the keyboard shortcuts. */
export function latestCard(state: CallState): Card | undefined {
  return state.cards.at(-1);
}

// Returns a copy of the state where the card with `id` is replaced by `change(card)`.
// If there is no such card the state is returned as it was (nothing to update).
function updateCard(state: CallState, id: number, change: (card: Card) => Card): CallState {
  if (!state.cards.some((card) => card.id === id)) return state;
  return { ...state, cards: state.cards.map((card) => (card.id === id ? change(card) : card)) };
}

export function callReducer(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.state };

    case 'interim':
      return { ...state, finalText: action.finalText, interimText: action.interimText };

    case 'sentence':
      if (state.cards.some((card) => card.id === action.id)) return state; // already have it
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            id: action.id,
            text: action.text,
            translation: { text: '', state: 'waiting' },
            hint: null,
          },
        ],
      };

    case 'translation_start':
      // A new attempt begins: forget the old text (it may be a half-finished one) and wait again.
      return updateCard(state, action.id, (card) => ({ ...card, translation: { text: '', state: 'waiting' } }));

    case 'translation_delta':
      return updateCard(state, action.id, (card) => {
        // A delta after a finished or failed translation means a retry began: start the text over.
        const restarting = card.translation.state === 'done' || card.translation.state === 'error';
        const text = restarting ? action.delta : card.translation.text + action.delta;
        return { ...card, translation: { text, state: 'streaming' } };
      });

    case 'translation_done':
      return updateCard(state, action.id, (card) => ({ ...card, translation: { ...card.translation, state: 'done' } }));

    case 'translation_error':
      return updateCard(state, action.id, (card) => ({ ...card, translation: { ...card.translation, state: 'error' } }));

    case 'hint_start':
      return updateCard(state, action.id, (card) => ({ ...card, hint: { mode: action.mode, text: '', state: 'streaming' } }));

    case 'hint_delta':
      return updateCard(state, action.id, (card) =>
        card.hint ? { ...card, hint: { ...card.hint, text: card.hint.text + action.delta } } : card,
      );

    case 'hint_done':
      return updateCard(state, action.id, (card) => (card.hint ? { ...card, hint: { ...card.hint, state: 'done' } } : card));

    case 'hint_error':
      return updateCard(state, action.id, (card) => (card.hint ? { ...card, hint: { ...card.hint, state: 'error' } } : card));

    case 'error':
      return { ...state, error: action.message };

    case 'session_restarted':
      // A new server session knows nothing about the old cards, so work that was still in
      // progress can never finish: mark it as failed (the text received so far stays).
      return {
        status: 'connecting',
        finalText: '',
        interimText: '',
        error: null,
        cards: state.cards.map((card) => ({
          ...card,
          translation:
            card.translation.state === 'done' ? card.translation : { ...card.translation, state: 'error' },
          hint: card.hint && card.hint.state === 'streaming' ? { ...card.hint, state: 'error' } : card.hint,
        })),
      };

    case 'reset':
      return initialCallState;

    default:
      return state; // restart_recorder and anything else do not change the screen
  }
}
