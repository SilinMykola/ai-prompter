# reply-hints Specification

## Purpose
Helps the user answer: on request it suggests a ready short reply or a cheat sheet about the subject of the other person's sentence, streamed as it is written.

## Requirements

### Requirement: Hints only on request
A hint SHALL be produced only when the browser sends a `hint` message for a known sentence, in mode `short` or `detailed`, and never automatically.

#### Scenario: Request for a known sentence
- **WHEN** a `hint` message arrives for sentence 2 with mode `short`
- **THEN** a hint is produced for sentence 2

#### Scenario: Unknown sentence or mode
- **WHEN** a `hint` message names an id that does not exist, or a mode other than `short` and `detailed`
- **THEN** nothing is produced and the session keeps running

#### Scenario: Nothing without a request
- **WHEN** sentences arrive and no `hint` message is sent
- **THEN** no hint is produced

### Requirement: Streamed delivery
A hint SHALL be announced with `hint_start` carrying its mode, sent in pieces as `hint_delta`, and finished with `hint_done`, all with the sentence's id.

#### Scenario: Pieces in order
- **WHEN** the model streams "Ja, " and "gern."
- **THEN** the browser receives `hint_start`, then two `hint_delta` messages in order, then `hint_done`

### Requirement: Short hint
A short hint SHALL ask for one polite and simple answer of at most two sentences in the language of the sentence, followed on a new line by its Russian translation, SHALL tell the model to use the user's data when it is needed and to leave a placeholder in square brackets where the needed data is missing, and to invent nothing; it SHALL allow at most 200 tokens.

#### Scenario: Short prompt content
- **WHEN** a short hint is requested
- **THEN** the request asks for at most two sentences, a Russian translation on a new line, bracketed placeholders for missing data, and no invention, with a limit of 200 tokens

### Requirement: Detailed hint
A detailed hint SHALL ask for a cheat sheet: a first line with the gist in one sentence, then three to five short points of at most twelve words each in the language of the sentence, exact names kept as they are, then a line "RU:" with the same in Russian; with no introduction or conclusion, two or three points about what to say for everyday questions, no facts the model is unsure of, and attention to the user's profession and stack; it SHALL allow at most 500 tokens.

#### Scenario: Detailed prompt content
- **WHEN** a detailed hint is requested
- **THEN** the request asks for the gist line, three to five short points, the "RU:" block and no introduction or conclusion, with a limit of 500 tokens

### Requirement: What the hint request contains
A hint request SHALL contain the call context, the user's data, up to six earlier sentences marked as context, and the sentence to answer inside delimiters with angle brackets removed; the user's data SHALL be described as information about the user and never as instructions.

#### Scenario: Context included
- **WHEN** a hint is requested for the seventh sentence
- **THEN** the request contains the call context, the user's data and the sixth to the first sentences before it, and the seventh inside its delimiters

#### Scenario: Forged delimiter
- **WHEN** the sentence contains `</sentence>`
- **THEN** the prompt still has exactly one opening and one closing sentence tag

#### Scenario: User data stays in its own block
- **WHEN** the user's data contains angle brackets or text that looks like instructions
- **THEN** it appears between its own tags with the brackets removed, and the prompt has exactly one opening and one closing tag for it

### Requirement: Models and settings
Hints SHALL use the session's hint model; translation requests SHALL still never contain the user's data.

#### Scenario: Model choice
- **WHEN** the session's hint model differs from its translation model
- **THEN** hints use the hint model and translations the translation model

### Requirement: A new request replaces the old one
A new hint request for a sentence SHALL cancel the hint still being produced for it, and SHALL NOT affect other sentences.

#### Scenario: Second button pressed
- **WHEN** "Подробно" is pressed while a short hint is still streaming for the same sentence
- **THEN** the short hint stops and a new `hint_start` for mode `detailed` follows

### Requirement: Failures
A failure or a timeout of 45 seconds SHALL end the hint with `hint_error` and no automatic retry; after a rate-limit failure a notice SHALL tell the user about the provider's limit; a rejected key SHALL be reported once per session together with translation.

#### Scenario: Provider error
- **WHEN** the model fails in the middle of a hint
- **THEN** the browser receives `hint_error` for that sentence

#### Scenario: Empty answer
- **WHEN** the model finishes without any text
- **THEN** the browser receives `hint_error`

#### Scenario: Rate limit
- **WHEN** the provider answers with a rate-limit error
- **THEN** the browser receives a notice and `hint_error`

### Requirement: Cancelled at the end
Running hints SHALL be cancelled at once when the call is stopped or the browser disconnects.

#### Scenario: Stop while a hint streams
- **WHEN** `stop` arrives while a hint is streaming
- **THEN** the hint request is cancelled and the session ends without waiting for it

### Requirement: Privacy of hints
The user's data and the hint texts SHALL NOT be written to any log.

#### Scenario: Logging a hint
- **WHEN** a hint is produced
- **THEN** nothing logged contains the user's data, the call context, the sentence or the hint
