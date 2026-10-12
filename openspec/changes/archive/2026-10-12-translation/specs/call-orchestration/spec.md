# Spec Delta

## ADDED Requirements

### Requirement: Notices from the server
A `notice` message from the server SHALL be shown as a short note that goes away by itself, and SHALL NOT change the error line or the state of the call.

#### Scenario: Rate limit notice
- **WHEN** the server sends a `notice` with the text "Лимит запросов провайдера"
- **THEN** that text is shown as a short note and the error line is unchanged
