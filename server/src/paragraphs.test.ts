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

  it('starts a new paragraph when another known speaker talks', () => {
    let clock = 1_000_000;
    const paragrapher = createParagrapher(() => (clock += 500));

    expect([
      paragrapher.next('Haben Sie Fragen?', undefined, 0),
      paragrapher.next('Ja.', undefined, 1),
      paragrapher.next('Wie lang?', undefined, 1),
      paragrapher.next('Kurz.', undefined, 0),
      paragrapher.next('Gut.', undefined, undefined),
    ]).toEqual([1, 2, 2, 3, 3]);
  });

  it('starts a new paragraph after startOver and does not compare the speaker with earlier ones', () => {
    let clock = 1_000_000;
    const paragrapher = createParagrapher(() => (clock += 500));
    paragrapher.next('Eins.', undefined, 1);

    paragrapher.startOver();

    expect([paragrapher.next('Zwei.', undefined, 0), paragrapher.next('Drei.', undefined, 0)]).toEqual([2, 2]);
  });
});
