# Spec Delta

## Purpose

Lets the user prepare a call: choose where the sound comes from, the language, the provider and models, add optional context, and start; and explains clearly what to do when something blocks the start.

## ADDED Requirements

### Requirement: Loading the server configuration
On opening, the app SHALL load the server's configuration and show the setup form once it is available; while loading it SHALL say so, and if loading fails it SHALL explain the problem and offer to try again.

#### Scenario: Loading
- **WHEN** the page opens
- **THEN** a short loading note is shown until the configuration arrives

#### Scenario: Server unreachable
- **WHEN** the configuration cannot be loaded
- **THEN** the screen says the server did not answer and shows a retry button

### Requirement: Choices on the form
The form SHALL offer: audio source (Chrome tab, default, or microphone); call language (German, default, English, or automatic German and English); provider; translation model; hint model; a free-text call context with the placeholder "Кто звонит, куда, зачем. Например: запись к терапевту; техническое интервью на Magento-разработчика"; a free-text "my data" field with the placeholder "Имя, дата рождения, страховая, профессия и стек — то, о чём могут спросить"; and a start button.

#### Scenario: Defaults
- **WHEN** nothing was remembered and the server's default provider is Gemini
- **THEN** the form shows tab, German, Gemini, that provider's default translation model and default hint model, and empty text fields

#### Scenario: Placeholders
- **WHEN** the form is shown
- **THEN** the two text fields show the texts above as placeholders

### Requirement: One provider is shown as text
When only one provider is available the form SHALL show its name as plain text instead of a list.

#### Scenario: Single provider
- **WHEN** the configuration lists only Gemini
- **THEN** there is no provider selector and "Gemini" is shown as text

### Requirement: Provider change resets models
Choosing another provider SHALL reset both model choices to that provider's defaults.

#### Scenario: Switch to Claude
- **WHEN** the user picks Claude
- **THEN** both model lists show Claude's models with its defaults selected

### Requirement: Remembered choices
The form SHALL start with the remembered audio source, language, provider, models and "my data", and SHALL remember them when a call starts; the call context SHALL start empty every time.

#### Scenario: Return visit
- **WHEN** the user returns after starting a call with English and a profile text
- **THEN** English and the profile text are preselected, and the context field is empty

### Requirement: Starting needs a click
Pressing start SHALL immediately ask the browser for audio, so that the browser's share dialog opens from the click; if audio cannot be obtained, the form SHALL stay and show the reason with a retry button.

#### Scenario: Audio not shared
- **WHEN** the user shares a tab without its audio
- **THEN** the form shows "Звук не захвачен. Выберите вкладку Chrome и включите «Также поделиться звуком вкладки»." and a button "Попробовать снова"

#### Scenario: Successful start
- **WHEN** audio is obtained
- **THEN** the call screen replaces the form

### Requirement: No modal windows
The setup screen SHALL NOT use modal dialogs or pop-up notices.

#### Scenario: Error display
- **WHEN** an error occurs
- **THEN** it appears as text in the page
