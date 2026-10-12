// Turns a stream of speech-recognition results into complete, numbered sentences.
//
// This module is "pure": it does no network or file work and has no timers, so the same
// inputs always give the same outputs. That makes it easy to test.
//
// Deepgram sends two kinds of results:
//   - interim (isFinal: false): a guess for the phrase being spoken right now, it may change;
//   - final (isFinal: true): text that will not change any more.
// Final text is collected in a buffer, and finished sentences are cut off its front.

/** One recognition result from the speech-to-text service. */
export interface SttResult {
  transcript: string;
  isFinal: boolean;
  /** Deepgram thinks the speaker has finished the phrase (a pause was detected). */
  speechFinal: boolean;
}

export interface Sentence {
  id: number;
  text: string;
}

/** What the caller gets back after every input. */
export interface AssemblerOutput {
  /** Sentences completed by this input (usually 0 or 1). */
  sentences: Sentence[];
  /** Confirmed text that is not a complete sentence yet. */
  finalText: string;
  /** Latest guess for the phrase being spoken; shown in grey on the live card. */
  interimText: string;
}

export interface SentenceAssembler {
  pushResult(result: SttResult): AssemblerOutput;
  /** Deepgram's UtteranceEnd event: the speaker stopped, so whatever is buffered is complete. */
  pushUtteranceEnd(): AssemblerOutput;
}

/** A sentence is never longer than this, so one translation request stays small and fast. */
const MAX_SENTENCE_LENGTH = 300;

const TERMINATORS = new Set(['.', '?', '!', '…']);

// Words whose final dot is not the end of a sentence. Lowercase; compared ignoring case.
// To support another abbreviation, add it here.
const ABBREVIATIONS = new Set(['z.b.', 'dr.', 'nr.', 'bzw.', 'ca.', 'e.g.', 'mr.', 'mrs.']);

/** True if the word that ends at `end` (exclusive) is a known abbreviation such as "z.B.". */
function endsWithAbbreviation(buffer: string, end: number): boolean {
  // The word is everything after the last whitespace; opening quotes/brackets are not part of it.
  const wordStart = buffer.slice(0, end).search(/\S+$/);
  const word = buffer.slice(wordStart, end).replace(/^[("„“'‚]+/, '');
  return ABBREVIATIONS.has(word.toLowerCase());
}

/** Where to cut a text that is longer than the limit: after the last comma, else at the last space. */
function findCut(text: string): number {
  const comma = text.lastIndexOf(',', MAX_SENTENCE_LENGTH - 1);
  if (comma > 0) return comma + 1;
  const space = text.lastIndexOf(' ', MAX_SENTENCE_LENGTH);
  if (space > 0) return space;
  return MAX_SENTENCE_LENGTH; // no good place: cut in the middle of a word
}

/** Splits a text into pieces of at most MAX_SENTENCE_LENGTH characters. */
function splitLong(text: string): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > MAX_SENTENCE_LENGTH) {
    const cut = findCut(rest);
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  pieces.push(rest);
  return pieces;
}

/** Text with no letters or digits (like "..." or "?!") is noise, not a sentence. */
function isMeaningful(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/**
 * Cuts finished sentences off the front of `buffer`.
 * Returns the sentences and the text that is left over.
 */
function extractSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0; // where the current sentence begins
  let i = 0;

  while (i < buffer.length) {
    if (!TERMINATORS.has(buffer[i])) {
      i++;
      continue;
    }
    // Swallow a run of marks such as "?!" or "...".
    let end = i + 1;
    while (end < buffer.length && TERMINATORS.has(buffer[end])) end++;

    // A boundary needs a space (or the end of the text) right after the marks.
    // This also keeps numbers and dates whole: in "3.5" or "12.10.2026" the dot is followed
    // by a digit, not by a space. Abbreviations like "z.B." are skipped explicitly; at the
    // end of the buffer they wait for the next result instead of being cut off.
    const atEnd = end === buffer.length;
    const spaceAfter = atEnd || /\s/.test(buffer[end]);
    if (spaceAfter && !endsWithAbbreviation(buffer, end)) {
      sentences.push(buffer.slice(start, end).trim());
      start = end;
    }
    i = end;
  }

  return { sentences, rest: buffer.slice(start).trim() };
}

/**
 * Creates an assembler for one call session. The state (buffer, interim text, id counter)
 * lives in local variables captured by the returned functions (a "closure"),
 * so there is no class and nothing is shared between sessions.
 */
export function createSentenceAssembler(): SentenceAssembler {
  let buffer = '';
  let interimText = '';
  let nextId = 1;

  // Gives ids to the texts, after splitting over-long ones and dropping empty/punctuation-only ones.
  function toSentences(texts: string[]): Sentence[] {
    return texts
      .flatMap(splitLong)
      .filter(isMeaningful)
      .map((text) => ({ id: nextId++, text }));
  }

  // Takes everything from the buffer as complete sentences (used at the end of speech).
  function flush(): string[] {
    const text = buffer;
    buffer = '';
    return text ? [text] : [];
  }

  function output(sentences: Sentence[]): AssemblerOutput {
    return { sentences, finalText: buffer, interimText };
  }

  function pushResult(result: SttResult): AssemblerOutput {
    const transcript = result.transcript.trim();

    if (!result.isFinal) {
      interimText = transcript;
      return output([]);
    }

    interimText = '';
    if (transcript) buffer = buffer ? `${buffer} ${transcript}` : transcript;

    const { sentences, rest } = extractSentences(buffer);
    buffer = rest;
    const texts = [...sentences];

    // Text that keeps growing without any boundary is cut off in pieces, so the
    // live buffer never gets longer than one sentence may be.
    while (buffer.length > MAX_SENTENCE_LENGTH) {
      const cut = findCut(buffer);
      texts.push(buffer.slice(0, cut).trim());
      buffer = buffer.slice(cut).trim();
    }

    if (result.speechFinal) texts.push(...flush());
    return output(toSentences(texts));
  }

  function pushUtteranceEnd(): AssemblerOutput {
    interimText = '';
    return output(toSentences(flush()));
  }

  return { pushResult, pushUtteranceEnd };
}
