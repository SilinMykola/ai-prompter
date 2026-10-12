# app-configuration Specification

## Purpose
Defines which settings the server reads from the environment, which of them are required, and how the server behaves when they are missing or inconsistent.

## Requirements

### Requirement: Required keys
The server SHALL refuse to start unless `DEEPGRAM_API_KEY` and at least one of `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` are set to non-empty values.

#### Scenario: Missing Deepgram key
- **WHEN** the server starts without `DEEPGRAM_API_KEY`
- **THEN** it exits with a non-zero code and a message that names `DEEPGRAM_API_KEY`

#### Scenario: No LLM key
- **WHEN** the server starts with neither `GEMINI_API_KEY` nor `ANTHROPIC_API_KEY`
- **THEN** it exits with a non-zero code and a message that names both variables

#### Scenario: One LLM key is enough
- **WHEN** only `GEMINI_API_KEY` is set besides the Deepgram key
- **THEN** the server starts and only Gemini is available

### Requirement: Blank values count as missing
A variable that is empty or contains only whitespace SHALL be treated as not set.

#### Scenario: Empty key in .env
- **WHEN** `ANTHROPIC_API_KEY=` is present with no value
- **THEN** the Claude provider is not available

### Requirement: Default provider
The default provider SHALL be the one named by `LLM_PROVIDER` if it has a key; otherwise the first available provider (Gemini before Claude), and a warning without any secret SHALL be logged.

#### Scenario: Configured default has no key
- **WHEN** `LLM_PROVIDER=anthropic` and only a Gemini key is set
- **THEN** the default provider is Gemini and a warning is logged

#### Scenario: Unset default
- **WHEN** `LLM_PROVIDER` is not set and both keys are present
- **THEN** the default provider is Gemini

### Requirement: Optional model overrides
`GEMINI_MODELS` and `ANTHROPIC_MODELS` SHALL be optional comma-separated lists; when set and non-empty, a provider offers exactly those models, the first one as the default fast model and the second (or the first, if only one) as the default strong model.

#### Scenario: Override with two models
- **WHEN** `GEMINI_MODELS=a,b`
- **THEN** Gemini offers `a` and `b`, with `a` as default translation model and `b` as default hint model

#### Scenario: Override with spaces
- **WHEN** `GEMINI_MODELS= a , b `
- **THEN** the models are `a` and `b`

### Requirement: Forgiving provider name
`LLM_PROVIDER` SHALL be matched ignoring letter case and surrounding spaces.

#### Scenario: Mixed case
- **WHEN** `LLM_PROVIDER= Anthropic ` and an Anthropic key is set
- **THEN** the default provider is Claude

### Requirement: Ports
The server port SHALL come from `PORT` and default to 8787 when it is unset, empty or not a positive integer.

#### Scenario: Blank port
- **WHEN** `PORT=` is present with no value
- **THEN** the server listens on 8787

#### Scenario: Invalid port
- **WHEN** `PORT` is non-empty but not an integer from 1 to 65535
- **THEN** the server listens on 8787 and a warning is logged
