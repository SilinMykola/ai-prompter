# setup-settings Specification

## Purpose
Defines the settings a user picks before a call, which of them are remembered between visits, and how stale or unreadable remembered values are handled.

## Requirements

### Requirement: Default settings
Without remembered values the settings SHALL be: audio source tab, language German, the server's default provider, that provider's default translation model and default hint model, and empty call context and profile.

#### Scenario: First visit
- **WHEN** nothing is stored and the server config names `gemini` with default models `a` and `b`
- **THEN** the settings are tab, `de`, `gemini`, `a`, `b`, empty context and empty profile

### Requirement: What is remembered
The audio source, language, provider, both models and the profile text SHALL be remembered between visits; the call context SHALL NOT be stored anywhere.

#### Scenario: Saving
- **WHEN** settings are saved
- **THEN** storage holds source, language, provider, models and profile, and does not hold the call context

### Requirement: Stale choices fall back silently
A remembered provider that is no longer available, or a remembered model that the provider no longer offers, SHALL be replaced by the current default without any message.

#### Scenario: Provider gone
- **WHEN** the remembered provider is `anthropic` and only `gemini` is available
- **THEN** the settings use `gemini` with its default models

#### Scenario: Model gone
- **WHEN** the remembered hint model is not in the provider's list
- **THEN** that model alone is replaced by the default hint model and the other remembered choices stay

### Requirement: Changing the provider resets the models
Choosing another provider SHALL set both models to that provider's defaults.

#### Scenario: Switch provider
- **WHEN** the user switches from `gemini` to `anthropic`
- **THEN** translation and hint models become Claude's defaults

### Requirement: Broken storage is harmless
Reading or writing storage that throws, or that holds invalid data, SHALL NOT break the app.

#### Scenario: Storage throws
- **WHEN** reading storage throws an error
- **THEN** the default settings are used

#### Scenario: Invalid data
- **WHEN** storage holds text that is not valid JSON or has wrong types
- **THEN** the invalid parts are ignored and defaults are used for them

#### Scenario: Write fails
- **WHEN** saving throws an error
- **THEN** the app continues and no error is shown
