# Spec Delta

## ADDED Requirements

### Requirement: Speaker of a sentence
The `sentence` message SHALL have an optional integer field `speaker`: the speaker number reported by speech recognition, starting at 0.

#### Scenario: Shared type
- **WHEN** the server sends a sentence of speaker 1
- **THEN** the message type allows `speaker: 1` and the browser reads it from the shared type
