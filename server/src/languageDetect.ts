import type { TargetLanguage } from '@ai-prompter/shared/protocol';

// A rough guess of the language of one sentence, used to leave sentences alone that are
// already in the language the user reads. It is deliberately cautious: when it cannot tell
// (a short "Ja." or "ok"), it answers `undefined` and the sentence is translated as usual.

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LETTER = /\p{L}/gu;

// Letters that only Ukrainian has among the Cyrillic alphabets we care about.
const UKRAINIAN_ONLY = /[іїєґІЇЄҐ]/;

// Frequent words that the other language almost never uses. Lowercase.
const GERMAN_WORDS = new Set([
  'ich', 'sie', 'wir', 'ihr', 'der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für',
  'auf', 'ja', 'nein', 'bitte', 'danke', 'haben', 'sind', 'wird', 'werden', 'können', 'möchte', 'dass',
  'auch', 'noch', 'aber', 'oder', 'wie', 'was', 'wer', 'wo', 'wann', 'ihre', 'ihren', 'mein', 'meine',
  'dem', 'den', 'des', 'zu', 'bei', 'nach', 'von', 'um', 'es', 'im', 'am', 'zum', 'zur',
]);
const ENGLISH_WORDS = new Set([
  'the', 'and', 'is', 'are', 'was', 'were', 'not', 'you', 'your', 'we', 'they', 'it', 'this', 'that',
  'with', 'for', 'have', 'has', 'will', 'would', 'can', 'could', 'do', 'does', 'what', 'who', 'where',
  'when', 'how', 'yes', 'no', 'please', 'thanks', 'thank', 'of', 'to', 'in', 'on', 'at', 'my', 'me',
  'i', 'be', 'been', 'but', 'or', 'if', 'so', 'there', 'here',
]);

/** Share of the letters in `text` that match `pattern` (0 for a text without letters). */
function share(text: string, pattern: RegExp): number {
  const letters = text.match(LETTER)?.length ?? 0;
  return letters === 0 ? 0 : (text.match(pattern)?.length ?? 0) / letters;
}

/** The language of the sentence, or `undefined` when it is not clear. */
export function detectLanguage(text: string): TargetLanguage | undefined {
  if (share(text, CYRILLIC) > 0.5) {
    if (UKRAINIAN_ONLY.test(text)) return 'uk';
    return 'ru'; // plain Cyrillic without Ukrainian letters is taken as Russian
  }

  if (/[äöüßÄÖÜ]/.test(text)) return 'de';

  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const german = words.filter((word) => GERMAN_WORDS.has(word)).length;
  const english = words.filter((word) => ENGLISH_WORDS.has(word)).length;
  // Two words of evidence and a clear lead; "Ja." or "ok" is not enough to decide.
  if (german >= 2 && german >= english * 2) return 'de';
  if (english >= 2 && english >= german * 2) return 'en';
  return undefined;
}

/** True if the sentence is certainly already in the target language: no need to translate it. */
export function isAlreadyIn(target: TargetLanguage, text: string): boolean {
  const detected = detectLanguage(text);
  if (detected === undefined) return false;
  // Ukrainian text for a Russian reader (or the reverse) is still worth translating.
  return detected === target;
}
