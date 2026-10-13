// Groups the sentences of a call into paragraphs, so the screen shows a few readable blocks
// instead of one line per pause. A new paragraph starts when the current one
//   - already has MAX_SENTENCES sentences (the reader needs a place to switch), or
//   - would become longer than MAX_CHARS characters, or
//   - when the speaker was silent for longer than MAX_GAP_MS since the previous sentence.
//
// Pure apart from the clock, which is passed in so tests can control it.

export const MAX_SENTENCES = 5;
export const MAX_CHARS = 450;
export const MAX_GAP_MS = 3000;

export interface Paragrapher {
  /** The paragraph number (1, 2, 3...) that the next sentence belongs to. */
  next(text: string): number;
}

export function createParagrapher(now: () => number = Date.now): Paragrapher {
  let paragraph = 0;
  let sentences = 0;
  let chars = 0;
  let lastAt = 0;

  return {
    next(text) {
      const at = now();
      const startsNew =
        paragraph === 0 ||
        sentences >= MAX_SENTENCES ||
        chars + text.length > MAX_CHARS ||
        at - lastAt > MAX_GAP_MS;
      if (startsNew) {
        paragraph++;
        sentences = 0;
        chars = 0;
      }
      sentences++;
      chars += text.length;
      lastAt = at;
      return paragraph;
    },
  };
}
