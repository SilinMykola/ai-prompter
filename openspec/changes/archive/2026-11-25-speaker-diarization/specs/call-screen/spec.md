# Spec Delta

## ADDED Requirements

### Requirement: Speaker labels
Once the call has had sentences of more than one speaker, every paragraph with a sentence that carries a speaker number SHALL show the label «Собеседник N» above its text, where N is the speaker number of its first such sentence plus one; while only one speaker has been heard, no label SHALL be shown.

#### Scenario: Two speakers
- **WHEN** the call has a paragraph of speaker 0 and a paragraph of speaker 1
- **THEN** the paragraphs are labelled «Собеседник 1» and «Собеседник 2»

#### Scenario: One speaker
- **WHEN** all sentences of the call are of speaker 0
- **THEN** no paragraph shows a speaker label
