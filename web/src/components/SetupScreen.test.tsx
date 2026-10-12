import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiConfig } from '@ai-prompter/shared/protocol';
import { resolveSettings, type Settings } from '../lib/settings';
import { SetupScreen } from './SetupScreen';

const twoProviders: ApiConfig = {
  defaultProvider: 'gemini',
  providers: [
    { id: 'gemini', label: 'Gemini', models: ['g-fast', 'g-strong'], defaultTranslationModel: 'g-fast', defaultHintModel: 'g-strong' },
    { id: 'anthropic', label: 'Claude', models: ['c-fast', 'c-strong'], defaultTranslationModel: 'c-fast', defaultHintModel: 'c-strong' },
  ],
};
const oneProvider: ApiConfig = { ...twoProviders, providers: [twoProviders.providers[0]] };

// The screen is "controlled": the parent owns the settings. This little parent does the same job in tests.
function renderScreen(config: ApiConfig, options: { error?: string | null; initial?: Partial<Settings> } = {}) {
  const onStart = vi.fn();
  const changes: Settings[] = [];
  function Parent() {
    const [settings, setSettings] = useState<Settings>({ ...resolveSettings(config, undefined), ...options.initial });
    return (
      <SetupScreen
        config={config}
        settings={settings}
        error={options.error ?? null}
        onChange={(next) => {
          changes.push(next);
          setSettings(next);
        }}
        onStart={onStart}
      />
    );
  }
  render(<Parent />);
  return { onStart, changes, user: userEvent.setup() };
}

describe('setup screen', () => {
  it('shows the defaults', () => {
    renderScreen(twoProviders);

    expect(screen.getByRole('radio', { name: 'Вкладка Chrome' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Микрофон' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Немецкий' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Английский' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Авто (DE+EN)' })).not.toBeChecked();
    expect(screen.getByLabelText('Провайдер')).toHaveValue('gemini');
    expect(screen.getByLabelText('Модель перевода')).toHaveValue('g-fast');
    expect(screen.getByLabelText('Модель подсказок')).toHaveValue('g-strong');
  });

  it('has the two text fields with their placeholders, empty at first', () => {
    renderScreen(twoProviders);

    expect(screen.getByLabelText('Контекст звонка')).toHaveValue('');
    expect(screen.getByLabelText('Контекст звонка')).toHaveAttribute(
      'placeholder',
      'Кто звонит, куда, зачем. Например: запись к терапевту; техническое интервью на Magento-разработчика',
    );
    expect(screen.getByLabelText('Мои данные')).toHaveAttribute(
      'placeholder',
      'Имя, дата рождения, страховая, профессия и стек — то, о чём могут спросить',
    );
  });

  it('shows a single provider as plain text, without a list', () => {
    renderScreen(oneProvider);

    expect(screen.queryByLabelText('Провайдер')).not.toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
  });

  it('lists the models of the chosen provider only', () => {
    renderScreen(twoProviders);
    const options = within(screen.getByLabelText('Модель перевода')).getAllByRole('option');

    expect(options.map((o) => o.textContent)).toEqual(['g-fast', 'g-strong']);
  });

  it('resets both models when another provider is chosen', async () => {
    const { user, changes } = renderScreen(twoProviders, { initial: { translationModel: 'g-strong', hintModel: 'g-fast' } });

    await user.selectOptions(screen.getByLabelText('Провайдер'), 'anthropic');

    expect(changes.at(-1)).toMatchObject({ provider: 'anthropic', translationModel: 'c-fast', hintModel: 'c-strong' });
    expect(screen.getByLabelText('Модель перевода')).toHaveValue('c-fast');
    expect(screen.getByLabelText('Модель подсказок')).toHaveValue('c-strong');
  });

  it('reports every change of source, language, models and texts', async () => {
    const { user, changes } = renderScreen(twoProviders);

    await user.click(screen.getByRole('radio', { name: 'Микрофон' }));
    await user.click(screen.getByRole('radio', { name: 'Авто (DE+EN)' }));
    await user.selectOptions(screen.getByLabelText('Модель подсказок'), 'g-fast');
    await user.type(screen.getByLabelText('Контекст звонка'), 'Arzt');
    await user.type(screen.getByLabelText('Мои данные'), 'Ich');

    expect(changes.at(-1)).toMatchObject({
      audioSource: 'mic',
      language: 'multi',
      hintModel: 'g-fast',
      callContext: 'Arzt',
      profile: 'Ich',
    });
  });

  it('starts the call with the current settings when "Начать" is pressed', async () => {
    const { user, onStart } = renderScreen(twoProviders);
    await user.click(screen.getByRole('radio', { name: 'Английский' }));

    await user.click(screen.getByRole('button', { name: 'Начать' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ language: 'en', audioSource: 'tab' }));
  });

  it('shows an error as text with a retry button', async () => {
    const { user, onStart } = renderScreen(twoProviders, { error: 'Звук не захвачен. Выберите вкладку Chrome.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Звук не захвачен. Выберите вкладку Chrome.');
    expect(screen.queryByRole('button', { name: 'Начать' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Попробовать снова' }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does not use modal dialogs', () => {
    renderScreen(twoProviders, { error: 'Ошибка' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
