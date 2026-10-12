# Spec Delta

## Purpose

Describes what the call screen shows at any moment, derived only from the messages the server sends, so every screen renders the same facts.

## ADDED Requirements

### Requirement: Session status and live phrase
The state SHALL hold the latest session status and the live phrase (confirmed part and guessed part) exactly as last reported.

#### Scenario: Status update
- **WHEN** a `status` message with state `speaking` arrives
- **THEN** the state's status is `speaking`

#### Scenario: Live phrase
- **WHEN** an `interim` message arrives with `finalText` "Wie geht" and `interimText` "es"
- **THEN** the live phrase is "Wie geht" confirmed and "es" guessed

### Requirement: Sentence cards
Each `sentence` message SHALL add one card, in order of arrival, with its text, an empty translation that is waiting, and no hint.

#### Scenario: New sentence
- **WHEN** a `sentence` message with id 1 and text "Guten Tag." arrives
- **THEN** the state has one card with that id and text, whose translation is waiting

#### Scenario: Duplicate id
- **WHEN** a `sentence` message arrives with the id of an existing card
- **THEN** the existing card is kept unchanged and no second card is added

### Requirement: Streamed translation
`translation_delta` SHALL append text to the translation of the card with that id, `translation_done` SHALL mark it complete, and `translation_error` SHALL mark it failed; a retry that starts again SHALL replace the old text.

#### Scenario: Deltas in order
- **WHEN** deltas "Добрый " and "день." arrive for a card
- **THEN** its translation is "Добрый день." and it is streaming

#### Scenario: Done
- **WHEN** `translation_done` arrives
- **THEN** the card's translation is complete

#### Scenario: Error and retry
- **WHEN** `translation_error` arrives and later a new delta arrives for the same card
- **THEN** the card shows the new text only and is streaming again

#### Scenario: Unknown card
- **WHEN** a delta arrives for an id without a card
- **THEN** the state is unchanged

### Requirement: Streamed hints
`hint_start` SHALL clear the hint of the card and remember its mode, `hint_delta` SHALL append text, `hint_done` SHALL complete it and `hint_error` SHALL mark it failed; a new `hint_start` SHALL replace the previous hint.

#### Scenario: Replace a hint
- **WHEN** a short hint is complete and a `hint_start` for mode `detailed` arrives for the same card
- **THEN** the card's hint is empty, in mode `detailed` and streaming

#### Scenario: Hint error
- **WHEN** `hint_error` arrives
- **THEN** the card's hint is marked failed

### Requirement: Errors and recovery
An `error` message SHALL set the error line, and later `status` messages SHALL NOT remove it.

#### Scenario: Server error
- **WHEN** an `error` message arrives with a text
- **THEN** the state's error line is that text

#### Scenario: Error stays
- **WHEN** a `status` message arrives after an `error`
- **THEN** the error line is unchanged

### Requirement: Last finished sentence
The state SHALL be able to tell which card is the latest one, for hotkeys.

#### Scenario: Latest card
- **WHEN** cards with ids 1, 2 and 3 exist
- **THEN** the latest card is id 3

### Requirement: Cards survive a new server session
After the connection is re-established the existing cards and their texts SHALL stay, the live phrase, status and error line SHALL reset, and translations or hints that were still arriving SHALL be marked failed because the new session cannot finish them.

#### Scenario: Reconnect
- **WHEN** the connection layer reports a new session
- **THEN** all cards remain and the live phrase is empty

#### Scenario: Unfinished work
- **WHEN** a new session starts while a card's translation is still streaming
- **THEN** that translation is marked failed and its text so far stays
