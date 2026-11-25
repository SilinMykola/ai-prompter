# Spec Delta

## ADDED Requirements

### Requirement: Speakers in sentences and paragraphs
The session SHALL send the speaker number of a sentence in its `sentence` message, and a sentence of a different known speaker than the previous sentence SHALL start a new paragraph.

#### Scenario: Speaker in the message
- **WHEN** a final result "Guten Tag." of speaker 1 arrives
- **THEN** the client receives `sentence` "Guten Tag." with `speaker` 1

#### Scenario: New paragraph for a new speaker
- **WHEN** "Haben Sie Fragen?" of speaker 0 and, half a second later, "Ja." of speaker 1 arrive
- **THEN** they are in paragraphs 1 and 2
