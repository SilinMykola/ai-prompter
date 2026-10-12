import { describe, expect, it } from 'vitest';
import { createSentenceAssembler, type SttResult } from './sentences';

// Small helpers keep the tests short: a "final" result is text Deepgram is sure about,
// an "interim" one is a guess that may still change.
const final = (transcript: string, speechFinal = false): SttResult => ({ transcript, isFinal: true, speechFinal });
const interim = (transcript: string): SttResult => ({ transcript, isFinal: false, speechFinal: false });

describe('interim results', () => {
  it('only update the live text and never emit sentences', () => {
    const assembler = createSentenceAssembler();

    const out = assembler.pushResult(interim('Guten Ta'));

    expect(out.sentences).toEqual([]);
    expect(out.interimText).toBe('Guten Ta');
  });

  it('are cleared when the final result arrives', () => {
    const assembler = createSentenceAssembler();
    assembler.pushResult(interim('Guten Ta'));

    const out = assembler.pushResult(final('Guten Tag und'));

    expect(out.interimText).toBe('');
    expect(out.finalText).toBe('Guten Tag und');
  });
});

describe('sentence boundaries', () => {
  it('splits two sentences from one result', () => {
    const out = createSentenceAssembler().pushResult(final('Guten Tag. Wie geht es Ihnen?'));

    expect(out.sentences.map((s) => s.text)).toEqual(['Guten Tag.', 'Wie geht es Ihnen?']);
  });

  it('handles question and exclamation marks', () => {
    const out = createSentenceAssembler().pushResult(final('Haben Sie Zeit? Super!'));

    expect(out.sentences.map((s) => s.text)).toEqual(['Haben Sie Zeit?', 'Super!']);
  });

  it('handles the ellipsis character', () => {
    const out = createSentenceAssembler().pushResult(final('Na ja… Mal sehen.'));

    expect(out.sentences.map((s) => s.text)).toEqual(['Na ja…', 'Mal sehen.']);
  });

  it('keeps an unfinished tail in the buffer', () => {
    const out = createSentenceAssembler().pushResult(final('Das ist gut. Und dann'));

    expect(out.sentences.map((s) => s.text)).toEqual(['Das ist gut.']);
    expect(out.finalText).toBe('Und dann');
  });

  it('joins a sentence that continues across results', () => {
    const assembler = createSentenceAssembler();
    const first = assembler.pushResult(final('Ich möchte einen'));
    const second = assembler.pushResult(final('Termin vereinbaren.'));

    expect(first.sentences).toEqual([]);
    expect(second.sentences.map((s) => s.text)).toEqual(['Ich möchte einen Termin vereinbaren.']);
  });
});

describe('sentence ids', () => {
  it('increase across results, starting at 1', () => {
    const assembler = createSentenceAssembler();
    const a = assembler.pushResult(final('Eins. Zwei.'));
    const b = assembler.pushResult(final('Drei.'));

    expect([...a.sentences, ...b.sentences].map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it('start at 1 for every new assembler', () => {
    const a = createSentenceAssembler().pushResult(final('Eins.'));
    const b = createSentenceAssembler().pushResult(final('Eins.'));

    expect(a.sentences[0].id).toBe(1);
    expect(b.sentences[0].id).toBe(1);
  });
});

describe('numbers and dates', () => {
  it('does not split a decimal number', () => {
    const out = createSentenceAssembler().pushResult(final('Das kostet 3.5 Euro.'));

    expect(out.sentences.map((s) => s.text)).toEqual(['Das kostet 3.5 Euro.']);
  });

  it('does not split inside a date but splits after it', () => {
    const out = createSentenceAssembler().pushResult(final('Der Termin ist am 12.10.2026. Passt das?'));

    expect(out.sentences.map((s) => s.text)).toEqual(['Der Termin ist am 12.10.2026.', 'Passt das?']);
  });
});

describe('abbreviations', () => {
  // Each abbreviation is put into a sentence; the whole thing must stay in one piece.
  it.each(['z.B.', 'Dr.', 'Nr.', 'bzw.', 'ca.', 'e.g.', 'Mr.', 'Mrs.'])('does not split after %s', (abbr) => {
    const out = createSentenceAssembler().pushResult(final(`Das gilt ${abbr} morgen.`));

    expect(out.sentences.map((s) => s.text)).toEqual([`Das gilt ${abbr} morgen.`]);
  });

  it('ignores letter case', () => {
    const out = createSentenceAssembler().pushResult(final('DR. Müller und z.b. Frau Schmidt kommen.'));

    expect(out.sentences).toHaveLength(1);
  });

  it('handles several abbreviations in one sentence', () => {
    const out = createSentenceAssembler().pushResult(final('Dr. Müller hat z.B. Montag Zeit.'));

    expect(out.sentences.map((s) => s.text)).toEqual(['Dr. Müller hat z.B. Montag Zeit.']);
  });

  it('waits when the buffer ends with an abbreviation, then keeps the text', () => {
    const assembler = createSentenceAssembler();
    const first = assembler.pushResult(final('Wir brauchen z.B.'));
    const second = assembler.pushResult(final('einen Ausweis.'));

    expect(first.sentences).toEqual([]);
    expect(first.finalText).toBe('Wir brauchen z.B.');
    expect(second.sentences.map((s) => s.text)).toEqual(['Wir brauchen z.B. einen Ausweis.']);
  });
});

describe('flushing at the end of speech', () => {
  it('speech_final flushes a tail without punctuation', () => {
    const out = createSentenceAssembler().pushResult(final('Ich komme gleich', true));

    expect(out.sentences.map((s) => s.text)).toEqual(['Ich komme gleich']);
    expect(out.finalText).toBe('');
  });

  it('UtteranceEnd flushes the buffered tail', () => {
    const assembler = createSentenceAssembler();
    assembler.pushResult(final('Ich komme gleich'));

    const out = assembler.pushUtteranceEnd();

    expect(out.sentences.map((s) => s.text)).toEqual(['Ich komme gleich']);
    expect(out.finalText).toBe('');
  });

  it('UtteranceEnd with an empty buffer emits nothing', () => {
    const assembler = createSentenceAssembler();
    assembler.pushResult(final('Das war es.'));

    expect(assembler.pushUtteranceEnd().sentences).toEqual([]);
  });

  it('flushes a trailing abbreviation instead of losing it', () => {
    const assembler = createSentenceAssembler();
    assembler.pushResult(final('Wir brauchen z.B.'));

    expect(assembler.pushUtteranceEnd().sentences.map((s) => s.text)).toEqual(['Wir brauchen z.B.']);
  });
});

describe('over-long text', () => {
  const words = (count: number) => Array.from({ length: count }, (_, i) => `wort${i}`).join(' ');

  it('splits a 350+ character phrase into pieces of at most 300 characters', () => {
    const text = words(60); // about 400 characters, no punctuation at all
    const out = createSentenceAssembler().pushResult(final(text, true));

    expect(text.length).toBeGreaterThan(350);
    expect(out.sentences.length).toBeGreaterThan(1);
    for (const s of out.sentences) expect(s.text.length).toBeLessThanOrEqual(300);
    // Nothing is lost or reordered.
    expect(out.sentences.map((s) => s.text).join(' ')).toBe(text);
  });

  it('prefers the last comma over later spaces', () => {
    const head = words(20); // about 130 characters
    const text = `${head}, ${words(60)}`;
    const out = createSentenceAssembler().pushResult(final(text, true));

    expect(out.sentences[0].text).toBe(`${head},`);
  });

  it('splits a very long sentence that does have a boundary', () => {
    const text = `${words(60)}.`;
    const out = createSentenceAssembler().pushResult(final(text));

    for (const s of out.sentences) expect(s.text.length).toBeLessThanOrEqual(300);
    expect(out.sentences.map((s) => s.text).join(' ')).toBe(text);
  });

  it('hard-cuts text that has no comma and no space', () => {
    const out = createSentenceAssembler().pushResult(final('x'.repeat(650), true));

    expect(out.sentences.map((s) => s.text.length)).toEqual([300, 300, 50]);
  });
});

describe('empty input', () => {
  it('ignores an empty transcript, even with speech_final', () => {
    expect(createSentenceAssembler().pushResult(final('', true)).sentences).toEqual([]);
  });

  it.each(['...', ' .', '?!', '…'])('drops punctuation-only input %j', (text) => {
    const out = createSentenceAssembler().pushResult(final(text, true));

    expect(out.sentences).toEqual([]);
    expect(out.finalText).toBe('');
  });

  it('does not use up an id for dropped text', () => {
    const assembler = createSentenceAssembler();
    assembler.pushResult(final('...', true));

    expect(assembler.pushResult(final('Hallo.')).sentences[0].id).toBe(1);
  });
});
