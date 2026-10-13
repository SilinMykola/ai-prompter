import { describe, expect, it } from 'vitest';
import { createParagrapher, MAX_CHARS, MAX_GAP_MS, MAX_SENTENCES } from './paragraphs';

function setup() {
  let clock = 1_000_000;
  const paragrapher = createParagrapher(() => clock);
  return { next: (text = 'Ja.', after = 500) => paragrapher.next(((clock += after), text)) };
}

describe('paragraphs', () => {
  it('puts quick sentences into one paragraph and starts the next after five', () => {
    const { next } = setup();

    const numbers = Array.from({ length: MAX_SENTENCES + 2 }, () => next());

    expect(numbers).toEqual([1, 1, 1, 1, 1, 2, 2]);
  });

  it('starts a new paragraph after a long pause', () => {
    const { next } = setup();

    expect([next(), next('Ja.', MAX_GAP_MS - 1), next('Ja.', MAX_GAP_MS + 1), next()]).toEqual([1, 1, 2, 2]);
  });

  it('starts a new paragraph when the text would get too long', () => {
    const { next } = setup();
    const long = 'a'.repeat(MAX_CHARS - 10);

    expect([next(long), next('b'.repeat(20)), next()]).toEqual([1, 2, 2]);
  });

  it('numbers from 1', () => {
    expect(setup().next()).toBe(1);
  });
});
