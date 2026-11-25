# Spec Delta

## REMOVED Requirements

### Requirement: Live text and sentences
**Reason**: An utterance end no longer flushes the unfinished phrase at once; the phrase now waits for a silence.
**Migration**: Replaced by "Live text and held sentences" and "Waiting for the rest of a phrase" below.

## ADDED Requirements

### Requirement: Live text and held sentences
The session SHALL feed recognition results through the sentence assembler, send each finished sentence as `sentence` with its increasing id, and send the unfinished phrase as `interim` with `finalText` and `interimText`. An unfinished phrase SHALL be sent as a sentence only after a wait (see "Waiting for the rest of a phrase") or when the call stops.

#### Scenario: Sentence from final result
- **WHEN** a final result "Guten Tag. Wie geht" arrives
- **THEN** the client receives `sentence` id 1 "Guten Tag." and `interim` with `finalText` "Wie geht"

#### Scenario: Interim result
- **WHEN** an interim result "Wie geht es" arrives
- **THEN** the client receives `interim` with that text as `interimText` and no `sentence`

#### Scenario: Utterance end keeps the tail
- **WHEN** an utterance end arrives while "Ich komme gleich" is unfinished
- **THEN** the client receives no `sentence` at once

#### Scenario: Stop flushes the tail
- **WHEN** `stop` arrives while "Ich komme gleich" is unfinished
- **THEN** the client receives `sentence` "Ich komme gleich" before `status` `stopped`

### Requirement: Waiting for the rest of a phrase
The wait SHALL end 3 seconds after the last newly recognised words (a final or interim result with text) or utterance end; an empty result SHALL NOT extend it. While the call is stopping, or after it ended, the wait SHALL NOT send anything by itself.

#### Scenario: Silence flushes the tail
- **WHEN** "Ich komme gleich" is unfinished and 3 seconds pass without recognised words or an utterance end
- **THEN** the client receives `sentence` "Ich komme gleich" and an empty `interim`

#### Scenario: Speech within 3 seconds continues the sentence
- **WHEN** "Das ist meine Einleitung zum" is unfinished, an utterance end arrives, and 1.8 seconds later a final result "Forumsbeitrag." arrives
- **THEN** the client receives one `sentence` "Das ist meine Einleitung zum Forumsbeitrag." and no sentence for the fragment, also after a further 3 seconds

#### Scenario: Interim results keep the tail waiting
- **WHEN** "Ich komme" is unfinished and interim results keep arriving every second for 5 seconds
- **THEN** no `sentence` is sent during that time

#### Scenario: Empty results do not extend the wait
- **WHEN** "Ich komme gleich" is unfinished, and 2 seconds later an empty final result and an empty interim result arrive
- **THEN** the client receives `sentence` "Ich komme gleich" 3 seconds after the words, not later

#### Scenario: Last words while stopping join the phrase
- **WHEN** "Ich komme" is unfinished, `stop` arrives, and closing the recognition stream takes longer than the wait before it delivers "gleich."
- **THEN** the client receives one `sentence` "Ich komme gleich."

#### Scenario: Nothing after the browser left
- **WHEN** the connection closes while "Ich komme gleich" is unfinished and 10 seconds pass
- **THEN** no translation is started

### Requirement: A held phrase keeps its paragraph
A phrase sent after the wait SHALL be placed into paragraphs by the time its last words arrived, not by the time it was sent.

#### Scenario: Paragraph of a held phrase
- **WHEN** "Guten Tag. Wie geht" arrives, an utterance end follows 1 second later, the phrase is sent 3 seconds after that, and "Neues Thema." arrives 1 second after it was sent
- **THEN** "Guten Tag." and "Wie geht" are in paragraph 1 and "Neues Thema." is in paragraph 2
