import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@ai-prompter/shared/protocol';
import { callReducer, initialCallState, latestCard, type CallAction, type CallState } from './callReducer';

// Applies a list of actions to the state, one after another (what React's useReducer does over time).
const run = (actions: CallAction[], from: CallState = initialCallState): CallState => actions.reduce(callReducer, from);

const sentence = (id: number, text = `Satz ${id}.`): ServerMessage => ({ type: 'sentence', id, text });
const card = (state: CallState, id: number) => state.cards.find((c) => c.id === id)!;

describe('status and live phrase', () => {
  it('starts idle with nothing on the screen', () => {
    expect(initialCallState).toEqual({ status: 'idle', finalText: '', interimText: '', cards: [], error: null });
  });

  it('keeps the latest status', () => {
    expect(run([{ type: 'status', state: 'speaking' }]).status).toBe('speaking');
  });

  it('keeps the live phrase as reported', () => {
    const state = run([{ type: 'interim', finalText: 'Wie geht', interimText: 'es' }]);

    expect(state.finalText).toBe('Wie geht');
    expect(state.interimText).toBe('es');
  });
});

describe('sentence cards', () => {
  it('adds a card per sentence, in order, with a waiting translation and no hint', () => {
    const state = run([sentence(1, 'Guten Tag.'), sentence(2)]);

    expect(state.cards.map((c) => c.id)).toEqual([1, 2]);
    expect(card(state, 1)).toEqual({
      id: 1,
      text: 'Guten Tag.',
      translation: { text: '', state: 'waiting' },
      hint: null,
    });
  });

  it('ignores a sentence whose id already has a card', () => {
    const state = run([sentence(1, 'Erster.'), sentence(1, 'Anderer.')]);

    expect(state.cards).toHaveLength(1);
    expect(card(state, 1).text).toBe('Erster.');
  });

  it('knows the latest card', () => {
    expect(latestCard(initialCallState)).toBeUndefined();
    expect(latestCard(run([sentence(1), sentence(2), sentence(3)]))?.id).toBe(3);
  });
});

describe('streamed translation', () => {
  it('appends deltas and marks the card as streaming', () => {
    const state = run([
      sentence(1),
      { type: 'translation_delta', id: 1, delta: 'Добрый ' },
      { type: 'translation_delta', id: 1, delta: 'день.' },
    ]);

    expect(card(state, 1).translation).toEqual({ text: 'Добрый день.', state: 'streaming' });
  });

  it('marks the translation complete', () => {
    const state = run([sentence(1), { type: 'translation_delta', id: 1, delta: 'Да.' }, { type: 'translation_done', id: 1 }]);

    expect(card(state, 1).translation).toEqual({ text: 'Да.', state: 'done' });
  });

  it('marks a failure and keeps the text received so far', () => {
    const state = run([sentence(1), { type: 'translation_delta', id: 1, delta: 'Да' }, { type: 'translation_error', id: 1 }]);

    expect(card(state, 1).translation).toEqual({ text: 'Да', state: 'error' });
  });

  it('starts over when a retry begins after an error', () => {
    const state = run([
      sentence(1),
      { type: 'translation_delta', id: 1, delta: 'Старый' },
      { type: 'translation_error', id: 1 },
      { type: 'translation_delta', id: 1, delta: 'Новый' },
    ]);

    expect(card(state, 1).translation).toEqual({ text: 'Новый', state: 'streaming' });
  });

  it('starts over when a retry begins after a completed translation', () => {
    const state = run([
      sentence(1),
      { type: 'translation_delta', id: 1, delta: 'Старый' },
      { type: 'translation_done', id: 1 },
      { type: 'translation_delta', id: 1, delta: 'Новый' },
    ]);

    expect(card(state, 1).translation.text).toBe('Новый');
  });

  it('ignores messages for a card that does not exist', () => {
    const before = run([sentence(1)]);

    const after = run(
      [
        { type: 'translation_delta', id: 9, delta: 'x' },
        { type: 'translation_done', id: 9 },
        { type: 'translation_error', id: 9 },
      ],
      before,
    );

    expect(after).toEqual(before);
  });

  it('only changes the card it is meant for', () => {
    const state = run([sentence(1), sentence(2), { type: 'translation_delta', id: 2, delta: 'Два' }]);

    expect(card(state, 1).translation.state).toBe('waiting');
  });
});

describe('restarted translation', () => {
  it('empties the text and goes back to waiting, then builds the new text', () => {
    const state = run([
      sentence(1),
      { type: 'translation_delta', id: 1, delta: 'Добр' },
      { type: 'translation_start', id: 1 },
    ]);

    expect(card(state, 1).translation).toEqual({ text: '', state: 'waiting' });
    expect(card(run([{ type: 'translation_delta', id: 1, delta: 'Новый' }], state), 1).translation).toEqual({
      text: 'Новый',
      state: 'streaming',
    });
  });

  it('also clears a failed translation', () => {
    const state = run([sentence(1), { type: 'translation_error', id: 1 }, { type: 'translation_start', id: 1 }]);

    expect(card(state, 1).translation).toEqual({ text: '', state: 'waiting' });
  });

  it('ignores an unknown card', () => {
    const before = run([sentence(1)]);

    expect(run([{ type: 'translation_start', id: 9 }], before)).toEqual(before);
  });
});

describe('streamed hints', () => {
  it('builds a hint from start, deltas and done', () => {
    const state = run([
      sentence(1),
      { type: 'hint_start', id: 1, mode: 'short' },
      { type: 'hint_delta', id: 1, delta: 'Ja, ' },
      { type: 'hint_delta', id: 1, delta: 'gern.' },
      { type: 'hint_done', id: 1 },
    ]);

    expect(card(state, 1).hint).toEqual({ mode: 'short', text: 'Ja, gern.', state: 'done' });
  });

  it('replaces the previous hint when a new one starts', () => {
    const state = run([
      sentence(1),
      { type: 'hint_start', id: 1, mode: 'short' },
      { type: 'hint_delta', id: 1, delta: 'Kurz' },
      { type: 'hint_done', id: 1 },
      { type: 'hint_start', id: 1, mode: 'detailed' },
    ]);

    expect(card(state, 1).hint).toEqual({ mode: 'detailed', text: '', state: 'streaming' });
  });

  it('marks a failed hint', () => {
    const state = run([sentence(1), { type: 'hint_start', id: 1, mode: 'short' }, { type: 'hint_error', id: 1 }]);

    expect(card(state, 1).hint?.state).toBe('error');
  });

  it('ignores hint pieces without a started hint or for unknown cards', () => {
    const before = run([sentence(1)]);

    const after = run(
      [
        { type: 'hint_delta', id: 1, delta: 'x' },
        { type: 'hint_done', id: 1 },
        { type: 'hint_start', id: 7, mode: 'short' },
      ],
      before,
    );

    expect(after).toEqual(before);
  });
});

describe('errors', () => {
  it('shows a server error', () => {
    expect(run([{ type: 'error', message: 'Что-то сломалось' }]).error).toBe('Что-то сломалось');
  });

  it('keeps the error when later status messages arrive', () => {
    const state = run([{ type: 'error', message: 'Беда' }, { type: 'status', state: 'stopped' }]);

    expect(state.error).toBe('Беда');
  });

  it('ignores messages that do not change the screen', () => {
    expect(run([{ type: 'restart_recorder' }])).toEqual(initialCallState);
  });
});

describe('a new server session', () => {
  it('keeps the cards and resets live state and the error', () => {
    const before = run([
      sentence(1, 'Guten Tag.'),
      { type: 'interim', finalText: 'Und', interimText: 'dann' },
      { type: 'status', state: 'reconnecting' },
      { type: 'error', message: 'Alt' },
    ]);

    const after = run([{ type: 'session_restarted' }], before);

    expect(after.cards.map((c) => [c.id, c.text])).toEqual([[1, 'Guten Tag.']]);
    expect(after.finalText).toBe('');
    expect(after.interimText).toBe('');
    expect(after.error).toBeNull();
    expect(after.status).toBe('connecting');
  });

  it('marks unfinished translations and hints as failed but keeps their text', () => {
    const before = run([
      sentence(1),
      { type: 'translation_delta', id: 1, delta: 'Полов' },
      { type: 'hint_start', id: 1, mode: 'short' },
      { type: 'hint_delta', id: 1, delta: 'Ja' },
      sentence(2),
      { type: 'translation_delta', id: 2, delta: 'Готово' },
      { type: 'translation_done', id: 2 },
    ]);

    const after = run([{ type: 'session_restarted' }], before);

    expect(card(after, 1).translation).toEqual({ text: 'Полов', state: 'error' });
    expect(card(after, 1).hint).toEqual({ mode: 'short', text: 'Ja', state: 'error' });
    expect(card(after, 2).translation.state).toBe('done');
  });

  it('marks cards that never got a translation as failed too', () => {
    const after = run([{ type: 'session_restarted' }], run([sentence(1)]));

    expect(card(after, 1).translation.state).toBe('error');
  });
});

describe('the end of the call', () => {
  it('marks translations and hints that are still coming as failed, because nothing more will arrive', () => {
    const state = run([
      sentence(1),
      { type: 'translation_delta', id: 1, delta: 'Полов' },
      { type: 'hint_start', id: 1, mode: 'short' },
      sentence(2),
      sentence(3),
      { type: 'translation_delta', id: 3, delta: 'Готово' },
      { type: 'translation_done', id: 3 },
      { type: 'status', state: 'stopped' },
    ]);

    expect(card(state, 1).translation).toEqual({ text: 'Полов', state: 'error' });
    expect(card(state, 1).hint).toEqual({ mode: 'short', text: '', state: 'error' });
    expect(card(state, 2).translation.state).toBe('error');
    expect(card(state, 3).translation).toEqual({ text: 'Готово', state: 'done' });
    expect(state.status).toBe('stopped');
  });

  it('leaves finished hints alone', () => {
    const state = run([
      sentence(1),
      { type: 'hint_start', id: 1, mode: 'short' },
      { type: 'hint_delta', id: 1, delta: 'Ja.' },
      { type: 'hint_done', id: 1 },
      { type: 'status', state: 'stopped' },
    ]);

    expect(card(state, 1).hint).toEqual({ mode: 'short', text: 'Ja.', state: 'done' });
  });

  it('does not touch cards on other status changes', () => {
    const state = run([sentence(1), { type: 'status', state: 'reconnecting' }]);

    expect(card(state, 1).translation.state).toBe('waiting');
  });
});

describe('reset', () => {
  it('returns to the initial state', () => {
    expect(run([sentence(1), { type: 'reset' }])).toEqual(initialCallState);
  });
});
