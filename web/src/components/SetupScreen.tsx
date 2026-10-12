import type { FormEvent } from 'react';
import type { ApiConfig, Language, ProviderId } from '@ai-prompter/shared/protocol';
import { changeProvider, type AudioSource, type Settings } from '../lib/settings';

// The screen shown before a call. It is a "controlled" component: it does not keep the
// settings itself, it shows what the parent gives it (`settings`) and reports every change
// through `onChange`. The parent (App) owns the data, which makes the screen easy to test.

interface SetupScreenProps {
  config: ApiConfig;
  settings: Settings;
  onChange(settings: Settings): void;
  onStart(settings: Settings): void;
  /** Why the last start attempt failed (shown as text, with a retry button). */
  error: string | null;
  /** A start is in progress (the share dialog is open): the button is disabled meanwhile. */
  starting?: boolean;
}

const SOURCES: Array<{ value: AudioSource; label: string }> = [
  { value: 'tab', label: 'Вкладка Chrome' },
  { value: 'mic', label: 'Микрофон' },
];

const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: 'de', label: 'Немецкий' },
  { value: 'en', label: 'Английский' },
  { value: 'multi', label: 'Авто (DE+EN)' },
];

export function SetupScreen({ config, settings, onChange, onStart, error, starting = false }: SetupScreenProps) {
  const provider = config.providers.find((p) => p.id === settings.provider) ?? config.providers[0];

  // A small helper: "change one field, keep the rest".
  const update = (change: Partial<Settings>) => onChange({ ...settings, ...change });

  function handleSubmit(event: FormEvent) {
    event.preventDefault(); // do not reload the page
    onStart(settings);
  }

  return (
    <form className="setup" onSubmit={handleSubmit}>
      <h1 className="setup__title">Суфлёр для звонка</h1>

      <fieldset className="field">
        <legend>Источник звука</legend>
        <div className="choices">
          {SOURCES.map(({ value, label }) => (
            <label key={value} className="choice">
              <input type="radio" name="source" checked={settings.audioSource === value} onChange={() => update({ audioSource: value })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Язык звонка</legend>
        <div className="choices">
          {LANGUAGES.map(({ value, label }) => (
            <label key={value} className="choice">
              <input type="radio" name="language" checked={settings.language === value} onChange={() => update({ language: value })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        {config.providers.length > 1 ? (
          <>
            <label htmlFor="provider">Провайдер</label>
            <select
              id="provider"
              value={settings.provider}
              onChange={(event) => onChange(changeProvider(settings, config, event.target.value as ProviderId))}
            >
              {config.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="field__static">
            <span className="field__static-label">Провайдер</span>
            {provider.label}
          </p>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="translation-model">Модель перевода</label>
          <select id="translation-model" value={settings.translationModel} onChange={(event) => update({ translationModel: event.target.value })}>
            {provider.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hint-model">Модель подсказок</label>
          <select id="hint-model" value={settings.hintModel} onChange={(event) => update({ hintModel: event.target.value })}>
            {provider.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="call-context">Контекст звонка</label>
        <textarea
          id="call-context"
          rows={3}
          value={settings.callContext}
          placeholder="Кто звонит, куда, зачем. Например: запись к терапевту; техническое интервью на Magento-разработчика"
          onChange={(event) => update({ callContext: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="profile">Мои данные</label>
        <textarea
          id="profile"
          rows={3}
          value={settings.profile}
          placeholder="Имя, дата рождения, страховая, профессия и стек — то, о чём могут спросить"
          onChange={(event) => update({ profile: event.target.value })}
        />
      </div>

      {error && (
        <p className="setup__error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="button button--primary" disabled={starting}>
        {starting ? 'Запускаю…' : error ? 'Попробовать снова' : 'Начать'}
      </button>
    </form>
  );
}
