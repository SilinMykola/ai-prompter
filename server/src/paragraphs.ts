// Groups the sentences of a call into paragraphs, so the screen shows a few readable blocks
// instead of one line per pause. A new paragraph starts when the current one
//   - already has MAX_SENTENCES sentences (the reader needs a place to switch), or
//   - would become longer than MAX_CHARS characters, or
//   - when the speaker was silent for longer than MAX_GAP_MS since the previous sentence, or
//   - when another known speaker talks.
//
// Pure apart from the clock, which is passed in so tests can control it.

export const MAX_SENTENCES = 5;
export const MAX_CHARS = 450;
export const MAX_GAP_MS = 3000;

export interface Paragrapher {
  /**
   * The paragraph number (1, 2, 3...) that the next sentence belongs to. `at` is when the sentence
   * was spoken, if that was earlier than now (a phrase held back before it became a sentence).
   * `speaker` is who said it, when known.
   */
  next(text: string, at?: number, speaker?: number): number;
  /**
   * Speech recognition reconnected and numbers speakers from scratch: the next sentence starts a new
   * paragraph, and its speaker is not compared with the ones before.
   */
  startOver(): void;
}

export function createParagrapher(now: () => number = Date.now): Paragrapher {
  let paragraph = 0;
  let sentences = 0;
  let chars = 0;
  let lastAt = 0;
  let lastSpeaker: number | undefined;
  let startNext = false;

  return {
    next(text, at = now(), speaker) {
      const startsNew =
        paragraph === 0 ||
        startNext ||
        sentences >= MAX_SENTENCES ||
        chars + text.length > MAX_CHARS ||
        at - lastAt > MAX_GAP_MS ||
        (speaker !== undefined && lastSpeaker !== undefined && speaker !== lastSpeaker);
      if (startsNew) {
        paragraph++;
        sentences = 0;
        chars = 0;
        startNext = false;
      }
      sentences++;
      chars += text.length;
      lastAt = at;
      if (speaker !== undefined) lastSpeaker = speaker;
      return paragraph;
    },
    startOver() {
      lastSpeaker = undefined;
      startNext = true;
    },
  };
}
