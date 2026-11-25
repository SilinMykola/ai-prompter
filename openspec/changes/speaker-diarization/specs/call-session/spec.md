# Spec Delta

## ADDED Requirements

### Requirement: Speakers in sentences and paragraphs
The session SHALL send the speaker number of a sentence in its `sentence` message, and a sentence of a different known speaker than the last known speaker SHALL start a new paragraph. A phrase cut off by another speaker SHALL be placed into paragraphs by the time it was said. When speech recognition reconnects, which numbers speakers from scratch, the session SHALL send the held phrase as a sentence, and the next sentence SHALL start a new paragraph without comparing speakers.

#### Scenario: Speaker in the message
- **WHEN** a final result "Guten Tag." of speaker 1 arrives
- **THEN** the client receives `sentence` "Guten Tag." with `speaker` 1

#### Scenario: New paragraph for a new speaker
- **WHEN** "Haben Sie Fragen?" of speaker 0 and, half a second later, "Ja." of speaker 1 arrive
- **THEN** they are in paragraphs 1 and 2

#### Scenario: Cut-off phrase keeps its paragraph
- **WHEN** "Haben Sie Fragen?" and one second later "und dann" of speaker 0 arrive, and three seconds later "Ja." of speaker 1, with interim results of speaker 1 in between
- **THEN** the sentences are in paragraphs 1, 1 and 2

#### Scenario: Reconnect
- **WHEN** "Ich komme" of speaker 0 is held and recognition reconnects, and then "Neu." of speaker 0 arrives
- **THEN** "Ich komme" is sent as a sentence at once, and "Neu." starts paragraph 2
