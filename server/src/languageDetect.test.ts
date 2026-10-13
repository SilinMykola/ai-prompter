import { describe, expect, it } from 'vitest';
import { detectLanguage, isAlreadyIn } from './languageDetect';

describe('detectLanguage', () => {
  it('recognises Russian by its alphabet', () => {
    expect(detectLanguage('Здравствуйте, у меня есть вопрос.')).toBe('ru');
  });

  it('recognises Ukrainian by its own letters', () => {
    expect(detectLanguage('Добрий день, у мене є питання.')).toBe('uk');
  });

  it('recognises German by umlauts and by common words', () => {
    expect(detectLanguage('Könnten Sie das wiederholen?')).toBe('de');
    expect(detectLanguage('Ich habe einen Termin am Montag.')).toBe('de');
  });

  it('recognises English by common words', () => {
    expect(detectLanguage('Can you tell me what the problem is?')).toBe('en');
  });

  it('does not guess on short or unclear text', () => {
    expect(detectLanguage('Ja.')).toBeUndefined();
    expect(detectLanguage('ok')).toBeUndefined();
    expect(detectLanguage('Magento 2')).toBeUndefined();
    expect(detectLanguage('...')).toBeUndefined();
  });

  it('keeps a Russian sentence with a Latin term Russian', () => {
    expect(detectLanguage('Нужно запустить cron и проверить индекс.')).toBe('ru');
  });
});

describe('isAlreadyIn', () => {
  it('is true only when the sentence is clearly in the target language', () => {
    expect(isAlreadyIn('ru', 'Здравствуйте, у меня есть вопрос.')).toBe(true);
    expect(isAlreadyIn('ru', 'Ich habe einen Termin am Montag.')).toBe(false);
    expect(isAlreadyIn('de', 'Ich habe einen Termin am Montag.')).toBe(true);
    expect(isAlreadyIn('en', 'Ich habe einen Termin am Montag.')).toBe(false);
  });

  it('translates when the language is unclear', () => {
    expect(isAlreadyIn('ru', 'Ja.')).toBe(false);
  });

  it('translates Ukrainian for a Russian reader', () => {
    expect(isAlreadyIn('ru', 'Добрий день, у мене є питання.')).toBe(false);
  });
});
