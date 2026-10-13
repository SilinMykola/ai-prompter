import type { Language, ProviderId, StartMessage, TargetLanguage } from '@ai-prompter/shared/protocol';
import type { Registry } from './llm';

// Checks the first message of a session. The message comes from the browser, so it is
// treated as untrusted: the shape is checked at runtime, not just by TypeScript types.
// Error messages are in Russian because they are shown to the user.

export type StartCheck = { ok: true; start: StartMessage } | { ok: false; message: string };

const LANGUAGES: Language[] = ['de', 'en', 'multi'];
const TARGET_LANGUAGES: TargetLanguage[] = ['ru', 'uk', 'de', 'en'];
const PROVIDER_IDS: ProviderId[] = ['gemini', 'anthropic'];

const fail = (message: string): StartCheck => ({ ok: false, message });

export async function validateStart(raw: unknown, registry: Pick<Registry, 'get' | 'modelsOf'>): Promise<StartCheck> {
  if (typeof raw !== 'object' || raw === null || (raw as { type?: unknown }).type !== 'start') {
    return fail('Первым сообщением сессии должно быть «start».');
  }
  const message = raw as Record<string, unknown>;

  if (!LANGUAGES.includes(message.language as Language)) return fail('Неизвестный язык звонка.');

  // Missing means Russian (older pages did not send it); anything else must be a known language.
  if (message.targetLanguage !== undefined && !TARGET_LANGUAGES.includes(message.targetLanguage as TargetLanguage)) {
    return fail('Неизвестный язык перевода.');
  }

  for (const field of ['provider', 'translationModel', 'hintModel'] as const) {
    if (typeof message[field] !== 'string' || message[field] === '') return fail('Не хватает настроек сессии.');
  }
  // Optional free-text fields: missing means empty, anything but text is an error.
  for (const field of ['callContext', 'profile'] as const) {
    if (message[field] !== undefined && typeof message[field] !== 'string') return fail('Неверный формат текстовых полей.');
  }

  const providerId = message.provider as string;
  const provider = PROVIDER_IDS.includes(providerId as ProviderId) ? registry.get(providerId as ProviderId) : undefined;
  if (!provider) return fail(`Провайдер «${providerId}» недоступен: не задан API-ключ.`);

  const models = await registry.modelsOf(provider.id);
  if (!models.includes(message.translationModel as string)) {
    return fail(`Модель перевода «${message.translationModel}» не найдена у провайдера ${provider.label}.`);
  }
  if (!models.includes(message.hintModel as string)) {
    return fail(`Модель подсказок «${message.hintModel}» не найдена у провайдера ${provider.label}.`);
  }

  return {
    ok: true,
    start: {
      type: 'start',
      language: message.language as Language,
      targetLanguage: (message.targetLanguage as TargetLanguage | undefined) ?? 'ru',
      provider: provider.id,
      translationModel: message.translationModel as string,
      hintModel: message.hintModel as string,
      callContext: (message.callContext as string | undefined) ?? '',
      profile: (message.profile as string | undefined) ?? '',
      devLog: message.devLog === true,
    },
  };
}
