# Spec Delta

## MODIFIED Requirements

### Requirement: Over-long text is split
The assembler SHALL NOT emit a sentence longer than 300 characters; text longer than that without a boundary SHALL be split at the last comma or space within the first 300 characters.

#### Scenario: Long phrase without punctuation
- **WHEN** a final result of 350 characters made of words separated by spaces, with no sentence mark, arrives and then `flush()` is called
- **THEN** every emitted sentence is at most 300 characters and joining them with spaces gives back the original words in order

#### Scenario: Preference for a comma
- **WHEN** an over-long text contains a comma and later spaces within the first 300 characters
- **THEN** the split happens at the last comma

## REMOVED Requirements

### Requirement: Flush on end of speech
**Reason**: Deepgram reports the end of speech on short pauses inside a sentence, so flushing there cut sentences in half in a live call.
**Migration**: The session flushes the tail with `flush()` after a silence (see `call-session`).

## ADDED Requirements

### Requirement: End of speech keeps the tail
A final result with `speech_final` set and an `UtteranceEnd` event SHALL NOT emit the buffered unfinished text; an `UtteranceEnd` SHALL clear the interim text.

#### Scenario: speech_final keeps the tail
- **WHEN** a final result "Ich komme gleich" arrives with `speech_final` true
- **THEN** no sentence is emitted and `finalText` is "Ich komme gleich"

#### Scenario: UtteranceEnd keeps the tail
- **WHEN** the buffer holds "Das ist meine Einleitung zum", `UtteranceEnd` arrives, and then a final result "Forumsbeitrag." arrives
- **THEN** nothing is emitted on `UtteranceEnd`, and one sentence "Das ist meine Einleitung zum Forumsbeitrag." is emitted after the final result

#### Scenario: UtteranceEnd clears the live guess
- **WHEN** the interim text is "Guten" and `UtteranceEnd` arrives
- **THEN** `interimText` is empty

### Requirement: Explicit flush
`flush()` SHALL emit the buffered text as a sentence even without closing punctuation, clear the interim text and leave the buffer empty.

#### Scenario: Flush the tail
- **WHEN** the buffer holds "Ich komme gleich" and `flush()` is called
- **THEN** the sentence "Ich komme gleich" is emitted and `finalText` is empty

#### Scenario: Flush an empty buffer
- **WHEN** `flush()` is called and the buffer is empty
- **THEN** no sentence is emitted
