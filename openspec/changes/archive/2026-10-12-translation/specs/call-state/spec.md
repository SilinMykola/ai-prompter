# Spec Delta

## MODIFIED Requirements

### Requirement: Streamed translation
`translation_start` SHALL empty the translation of the card with that id and put it back to waiting, `translation_delta` SHALL append text to it, `translation_done` SHALL mark it complete, and `translation_error` SHALL mark it failed; a delta that arrives after a completed or failed translation SHALL start the text over.

#### Scenario: Deltas in order
- **WHEN** deltas "Добрый " and "день." arrive for a card
- **THEN** its translation is "Добрый день." and it is streaming

#### Scenario: Done
- **WHEN** `translation_done` arrives
- **THEN** the card's translation is complete

#### Scenario: Error and retry
- **WHEN** `translation_error` arrives and later a new delta arrives for the same card
- **THEN** the card shows the new text only and is streaming again

#### Scenario: Restart in the middle
- **WHEN** a card has the partial text "Добр" and `translation_start` arrives
- **THEN** the text is empty and the card is waiting, and the following deltas build the new text

#### Scenario: Unknown card
- **WHEN** a delta or `translation_start` arrives for an id without a card
- **THEN** the state is unchanged
