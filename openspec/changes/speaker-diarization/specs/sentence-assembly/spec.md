# Spec Delta

## ADDED Requirements

### Requirement: A change of speaker ends the sentence
Each emitted sentence SHALL carry the speaker number of the text it was made of, when known. When a final result with text arrives from a different known speaker than the buffered text, the buffered text SHALL first be emitted as a sentence of the earlier speaker, even without closing punctuation.

#### Scenario: Speaker changes mid-phrase
- **WHEN** a final result "Haben Sie Fragen" of speaker 0 arrives and then a final result "Ja, eine." of speaker 1
- **THEN** the sentences "Haben Sie Fragen" with speaker 0 and "Ja, eine." with speaker 1 are emitted

#### Scenario: Same speaker continues
- **WHEN** final results "Ich möchte einen" and "Termin." both of speaker 0 arrive
- **THEN** one sentence "Ich möchte einen Termin." with speaker 0 is emitted

#### Scenario: Unknown speaker
- **WHEN** final results without a speaker arrive
- **THEN** sentences are emitted without a speaker, as before
