# Spec Delta

## ADDED Requirements

### Requirement: Fallback translation model
For a call, the fallback translation model SHALL be the newest offered "flash-lite" or "haiku" model other than the chosen translation model; else the newest offered plain "flash" model other than it; else there SHALL be none.

#### Scenario: Another lite model
- **WHEN** the chosen translation model is `gemini-flash-lite-latest` and the offered models include `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite` and `gemini-3.5-flash`
- **THEN** the fallback model is `gemini-3.5-flash-lite`

#### Scenario: Only a plain flash model
- **WHEN** the chosen translation model is `gemini-3.5-flash-lite` and the other offered models are `gemini-3.5-flash` and `gemini-3.1-pro`
- **THEN** the fallback model is `gemini-3.5-flash`

#### Scenario: No fast model besides the chosen one
- **WHEN** the chosen translation model is `gemini-3.5-flash-lite` and the only other offered model is `gemini-3.1-pro`
- **THEN** there is no fallback model
