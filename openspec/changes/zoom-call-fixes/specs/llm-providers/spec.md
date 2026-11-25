# Spec Delta

## MODIFIED Requirements

### Requirement: Default models
For each provider the registry SHALL choose a default translation model: `gemini-flash-lite-latest` when it is offered, else the newest "flash-lite" or "haiku" model, else the newest fast model; and a default hint model: the newest "sonnet" model; else the plain "flash" model of the same generation as the newest "flash-lite" or "haiku" model; else the newest plain "flash" model; else the newest "pro" model; else the newest model, where newest means the highest version number in the id.

#### Scenario: Newest lite model wins
- **WHEN** the offered models include `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite`
- **THEN** the default translation model is `gemini-3.5-flash-lite`

#### Scenario: Preferred translation model
- **WHEN** the offered models include `gemini-2.5-flash`, `gemini-3.5-flash-lite` and `gemini-flash-lite-latest`
- **THEN** the default translation model is `gemini-flash-lite-latest`

#### Scenario: Same generation for hints
- **WHEN** the offered models include `gemini-3.5-flash-lite`, `gemini-3.5-flash` and `gemini-3.8-flash`
- **THEN** the default hint model is `gemini-3.5-flash`

#### Scenario: Plain flash before pro
- **WHEN** the offered models include `gemini-3.5-flash` and `gemini-3.9-pro`
- **THEN** the default hint model is `gemini-3.5-flash`

#### Scenario: Pro for hints
- **WHEN** the offered models include `gemini-3.5-flash-lite` and `gemini-3.1-pro-preview` only, with no plain flash model
- **THEN** the default hint model is `gemini-3.1-pro-preview`
