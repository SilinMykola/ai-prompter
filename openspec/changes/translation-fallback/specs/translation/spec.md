# Spec Delta

## MODIFIED Requirements

### Requirement: Rate limits
After a rate-limit error, when the call has a fallback translation model, the system SHALL retry at once with the fallback model and SHALL send a notice naming the model that hit its limit and the fallback model; without a fallback model it SHALL wait two seconds before the retry and SHALL send a notice saying that the provider's request limit was reached.

#### Scenario: Rate limited
- **WHEN** the first attempt fails with a rate-limit error and there is no fallback model
- **THEN** a notice is sent, the retry starts after two seconds, and it may succeed

#### Scenario: Rate limited with a fallback model
- **WHEN** the first attempt with `gemini-flash-lite-latest` fails with a rate-limit error and the fallback model is `gemini-3.1-flash-lite`
- **THEN** a notice naming both models is sent, the retry asks `gemini-3.1-flash-lite` without waiting, and it may succeed

#### Scenario: Other errors keep the model
- **WHEN** the first attempt fails with an error that is not a rate limit and there is a fallback model
- **THEN** the retry asks the chosen translation model again
