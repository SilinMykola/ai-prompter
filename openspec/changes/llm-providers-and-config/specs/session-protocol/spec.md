# Spec Delta

## MODIFIED Requirements

### Requirement: Public configuration endpoint
The server SHALL answer `GET /api/config` with the default provider and the available providers with their models and default models, and SHALL NOT include any API key or secret.

#### Scenario: Config shape
- **WHEN** a client requests `/api/config`
- **THEN** the response has `defaultProvider` and `providers`, each provider having `id`, `label`, `models`, `defaultTranslationModel` and `defaultHintModel`

#### Scenario: Defaults are offered models
- **WHEN** the response is inspected
- **THEN** for every provider, `defaultTranslationModel` and `defaultHintModel` are members of its `models`

#### Scenario: No secrets
- **WHEN** the response is inspected
- **THEN** it contains no environment variable values other than provider ids, labels and model identifiers
