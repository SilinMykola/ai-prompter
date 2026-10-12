# Spec Delta

## MODIFIED Requirements

### Requirement: Low-latency requests
A request MAY be marked as low-latency (translation and hints), and Gemini SHALL then ask for as little thinking as the model accepts: first the minimal level, then the low level, then no thinking setting; a rejected level (HTTP 400 before any text) SHALL be followed by the next one, and the level that worked SHALL be remembered for that model.

#### Scenario: Model accepts minimal thinking
- **WHEN** a low-latency request is sent to a model that accepts minimal thinking
- **THEN** the request carries the minimal thinking setting

#### Scenario: Model rejects the setting
- **WHEN** the model answers with HTTP 400 before any text
- **THEN** the same request is sent again with the next thinking level and the answer is streamed

#### Scenario: Only the last resort works
- **WHEN** the minimal and the low level are both rejected
- **THEN** the request is repeated without any thinking setting, and later requests for that model start there

#### Scenario: A bad prompt is not blamed on thinking
- **WHEN** every level fails with HTTP 400
- **THEN** the error is reported and nothing is remembered for the model

### Requirement: Default models
For each provider the registry SHALL choose a default translation model (the newest "flash-lite" or "haiku" model, else the newest fast model) and a default hint model: the newest "sonnet" model; else the plain "flash" model of the same generation as the translation model; else the newest plain "flash" model; else the newest "pro" model; else the newest model, where newest means the highest version number in the id.

#### Scenario: Newest lite model wins
- **WHEN** the offered models include `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite`
- **THEN** the default translation model is `gemini-3.5-flash-lite`

#### Scenario: Same generation for hints
- **WHEN** the offered models include `gemini-3.5-flash-lite`, `gemini-3.5-flash` and `gemini-3.8-flash`
- **THEN** the default hint model is `gemini-3.5-flash`

#### Scenario: Plain flash before pro
- **WHEN** the offered models include `gemini-3.5-flash` and `gemini-3.9-pro`
- **THEN** the default hint model is `gemini-3.5-flash`

#### Scenario: Pro for hints
- **WHEN** the offered models include `gemini-3.5-flash-lite` and `gemini-3.1-pro-preview` only, with no plain flash model
- **THEN** the default hint model is `gemini-3.1-pro-preview`
