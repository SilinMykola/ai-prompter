# Spec Delta

## MODIFIED Requirements

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
