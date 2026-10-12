# session-protocol Specification

## Purpose
Defines the message contract between the browser and the server for one call session, and the public configuration endpoint, so both sides share one typed definition of what may be sent.

## Requirements

### Requirement: Shared typed message contract
The system SHALL define every client-to-server and server-to-client WebSocket message in a single shared module that both the server and the web app import.

#### Scenario: Both sides use the same types
- **WHEN** a message type is added or changed in the shared module
- **THEN** a type check of the server and of the web app fails wherever the old shape is still used

### Requirement: Client-to-server messages
The protocol SHALL allow the client to send `start`, `hint`, `retranslate` and `stop` as JSON, and raw audio chunks as binary frames.

#### Scenario: Start message fields
- **WHEN** the client opens a session
- **THEN** its first JSON message is `start` carrying `language` (`de`, `en` or `multi`), `provider`, `translationModel`, `hintModel`, `callContext` and `profile`

#### Scenario: Hint request fields
- **WHEN** the user asks for a hint on a sentence
- **THEN** the client sends `hint` with a numeric `id` and `mode` equal to `short` or `detailed`

#### Scenario: Retranslate request fields
- **WHEN** the user retries a failed translation
- **THEN** the client sends `retranslate` with the numeric `id` of that sentence

### Requirement: Server-to-client messages
The protocol SHALL allow the server to send these JSON messages: `status`, `interim`, `sentence`, `translation_start`, `translation_delta`, `translation_done`, `translation_error`, `hint_start`, `hint_delta`, `hint_done`, `hint_error`, `restart_recorder`, `notice` and `error`.

#### Scenario: Status states
- **WHEN** the server reports session state
- **THEN** `status.state` is one of `connecting`, `listening`, `speaking`, `reconnecting` or `stopped`

#### Scenario: Live card content
- **WHEN** the server reports in-progress speech
- **THEN** `interim` carries `finalText` and `interimText` as strings

#### Scenario: Sentence and streamed pieces share an id
- **WHEN** the server emits a `sentence`, then `translation_start`, `translation_delta`, `translation_done` or `hint_*` for it
- **THEN** every message carries the same numeric `id` as the `sentence`

#### Scenario: Human-readable errors
- **WHEN** the server sends `error`
- **THEN** its `message` is a Russian string suitable for showing to the user

#### Scenario: Short notices
- **WHEN** the server sends `notice`
- **THEN** its `message` is a Russian string meant for a short note that goes away by itself, not for an error line

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
