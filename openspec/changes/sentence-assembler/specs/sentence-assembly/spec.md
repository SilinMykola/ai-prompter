# Spec Delta

## Purpose

Turns the stream of partial and final speech-recognition results into complete, numbered sentences and the text of the unfinished phrase, so the UI and the translator can work sentence by sentence.

## ADDED Requirements

### Requirement: Interim results only update the live text
The assembler SHALL treat results that are not final as interim text and SHALL NOT emit sentences from them.

#### Scenario: Interim result
- **WHEN** a non-final result with transcript "Guten Ta" arrives
- **THEN** no sentence is emitted and `interimText` is "Guten Ta"

#### Scenario: Interim text is replaced by the final one
- **WHEN** a final result follows an interim result
- **THEN** `interimText` is empty and the final text is added to the buffer

### Requirement: Sentence boundaries
The assembler SHALL end a sentence at `.`, `?`, `!` or `…` followed by whitespace or the end of the buffered text, and SHALL keep the terminating mark in the sentence.

#### Scenario: Two sentences in one result
- **WHEN** a final result "Guten Tag. Wie geht es Ihnen?" arrives
- **THEN** two sentences are emitted: "Guten Tag." and "Wie geht es Ihnen?"

#### Scenario: Question and exclamation
- **WHEN** a final result "Haben Sie Zeit? Super!" arrives
- **THEN** the sentences "Haben Sie Zeit?" and "Super!" are emitted

#### Scenario: Unfinished tail stays in the buffer
- **WHEN** a final result "Das ist gut. Und dann" arrives without `speech_final`
- **THEN** "Das ist gut." is emitted and "Und dann" remains as `finalText`

#### Scenario: Sentence continues across results
- **WHEN** final results "Ich möchte einen" and "Termin vereinbaren." arrive in order
- **THEN** one sentence "Ich möchte einen Termin vereinbaren." is emitted

### Requirement: No split inside numbers and dates
A dot between two digits SHALL NOT end a sentence.

#### Scenario: Decimal number
- **WHEN** a final result "Das kostet 3.5 Euro." arrives
- **THEN** one sentence "Das kostet 3.5 Euro." is emitted

#### Scenario: Date
- **WHEN** a final result "Der Termin ist am 12.10.2026. Passt das?" arrives
- **THEN** the sentences "Der Termin ist am 12.10.2026." and "Passt das?" are emitted

### Requirement: No split after a day number
A dot that directly follows a number of one or two digits (a German ordinal date such as "12." or "3.") SHALL NOT end a sentence, so that "am 12. Oktober" stays whole. A number of three or more digits followed by a dot SHALL still end a sentence.

#### Scenario: Date with a month name
- **WHEN** a final result "Der Termin ist am 12. Oktober um 10 Uhr." arrives
- **THEN** one sentence "Der Termin ist am 12. Oktober um 10 Uhr." is emitted

#### Scenario: Single-digit day
- **WHEN** a final result "Wir treffen uns am 3. Mai." arrives
- **THEN** one sentence "Wir treffen uns am 3. Mai." is emitted

#### Scenario: Day number at the end of the buffer
- **WHEN** a final result "Der Termin ist am 12." arrives and a later final result "Oktober." follows
- **THEN** nothing is emitted after the first result and one sentence "Der Termin ist am 12. Oktober." is emitted after the second

#### Scenario: Longer number still ends a sentence
- **WHEN** a final result "Ich habe 123. Dann gehe ich." arrives
- **THEN** the sentences "Ich habe 123." and "Dann gehe ich." are emitted

### Requirement: No split after abbreviations
A dot that ends one of `z.B.`, `Dr.`, `Nr.`, `bzw.`, `ca.`, `e.g.`, `Mr.`, `Mrs.` (case-insensitive) SHALL NOT end a sentence.

#### Scenario: Abbreviation in the middle
- **WHEN** a final result "Dr. Müller hat z.B. Montag Zeit." arrives
- **THEN** one sentence "Dr. Müller hat z.B. Montag Zeit." is emitted

#### Scenario: Abbreviation at the end of the buffer
- **WHEN** a final result "Wir brauchen z.B." arrives and a later final result "einen Ausweis." follows
- **THEN** nothing is emitted after the first result and one sentence "Wir brauchen z.B. einen Ausweis." is emitted after the second

### Requirement: Flush on end of speech
The assembler SHALL emit the remaining buffered text as a sentence when a final result has `speech_final` set or when an `UtteranceEnd` event arrives, even without closing punctuation.

#### Scenario: speech_final flushes the tail
- **WHEN** a final result "Ich komme gleich" arrives with `speech_final` true
- **THEN** the sentence "Ich komme gleich" is emitted and `finalText` is empty

#### Scenario: UtteranceEnd flushes the tail
- **WHEN** the buffer holds "Ich komme gleich" and `UtteranceEnd` arrives
- **THEN** the sentence "Ich komme gleich" is emitted

#### Scenario: UtteranceEnd with an empty buffer
- **WHEN** `UtteranceEnd` arrives and the buffer is empty
- **THEN** no sentence is emitted

### Requirement: Over-long text is split
The assembler SHALL NOT emit a sentence longer than 300 characters; text longer than that without a boundary SHALL be split at the last comma or space within the first 300 characters.

#### Scenario: Long phrase without punctuation
- **WHEN** a final result of 350 characters made of words separated by spaces, with no sentence mark, arrives with `speech_final` true
- **THEN** every emitted sentence is at most 300 characters and joining them with spaces gives back the original words in order

#### Scenario: Preference for a comma
- **WHEN** an over-long text contains a comma and later spaces within the first 300 characters
- **THEN** the split happens at the last comma

### Requirement: Empty and punctuation-only text is dropped
The assembler SHALL NOT emit a sentence that is empty, whitespace-only or consists only of punctuation.

#### Scenario: Empty transcript
- **WHEN** a final result with an empty transcript and `speech_final` true arrives
- **THEN** no sentence is emitted

#### Scenario: Punctuation only
- **WHEN** a final result "..." or " ." arrives
- **THEN** no sentence is emitted

### Requirement: Increasing sentence ids
Each emitted sentence SHALL get an integer id that is greater than the id of the previous sentence of the same assembler, starting at 1.

#### Scenario: Ids across results
- **WHEN** three sentences are emitted over several results
- **THEN** their ids are 1, 2 and 3 in order

#### Scenario: Independent assemblers
- **WHEN** two assemblers are created
- **THEN** each starts its numbering at 1
