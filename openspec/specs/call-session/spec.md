# call-session Specification

## Purpose
Defines one call session over a WebSocket: how it starts, what flows in both directions, how it ends, and who is allowed to open it.

## Requirements

### Requirement: Session start
The first message of a connection SHALL be a valid `start`; the session SHALL answer `status` `connecting` and open a speech-recognition stream for the requested language, and SHALL close the connection with an `error` message if the first message is not a valid `start` or does not arrive within ten seconds.

#### Scenario: Valid start
- **WHEN** a valid `start` for language `de` arrives
- **THEN** the client receives `status` `connecting` and a recognition stream is opened for `de`

#### Scenario: Invalid start
- **WHEN** the first message names an unavailable provider
- **THEN** the client receives an `error` with a Russian message and the connection is closed

#### Scenario: Audio before start
- **WHEN** a binary frame arrives before any `start`
- **THEN** the client receives an `error` and the connection is closed

#### Scenario: No start in time
- **WHEN** ten seconds pass without a `start`
- **THEN** the connection is closed with an `error` message

#### Scenario: Second start
- **WHEN** a second `start` arrives in a running session
- **THEN** the client receives an `error` and the running session is unaffected

### Requirement: Status reporting
The session SHALL report `listening` when the recognition connection is open, `speaking` when speech starts, `listening` again when an utterance ends, and `reconnecting` while the recognition connection is being restored.

#### Scenario: Connected
- **WHEN** the recognition connection opens
- **THEN** the client receives `status` `listening`

#### Scenario: Speech cycle
- **WHEN** speech starts and later an utterance ends
- **THEN** the client receives `status` `speaking` and then `status` `listening`

#### Scenario: Outage
- **WHEN** the recognition connection is lost and later restored
- **THEN** the client receives `status` `reconnecting`, then `status` `listening` and a `restart_recorder` message

### Requirement: Audio forwarding
Binary frames SHALL be passed to the recognition stream unchanged.

#### Scenario: Audio chunk
- **WHEN** a binary frame arrives in a running session
- **THEN** the same bytes are sent to the recognition stream

### Requirement: Clean end of session
On `stop` the session SHALL close the recognition stream, deliver the sentences that were still in flight, send `status` `stopped` and close the connection; when the connection closes by itself the session SHALL close the recognition stream; in both cases all session data SHALL be dropped.

#### Scenario: Stop with words in flight
- **WHEN** `stop` arrives and the recognition stream still delivers a last final result while closing
- **THEN** the client receives its sentence, then `status` `stopped`, and the connection is closed

#### Scenario: Browser disappears
- **WHEN** the connection closes without `stop`
- **THEN** the recognition stream is closed

### Requirement: Recognition failures
A fatal recognition error SHALL be reported as an `error` message in Russian, followed by `status` `stopped` and closing of the connection.

#### Scenario: Rejected key
- **WHEN** the recognition service rejects the API key
- **THEN** the client receives an `error` saying so, then `status` `stopped`, and the connection is closed

### Requirement: Tolerance to bad input
Messages that are not valid JSON or have an unknown type SHALL NOT crash the session; `hint` SHALL produce a reply hint for a known sentence, and `retranslate` SHALL restart the translation of a known sentence.

#### Scenario: Garbage text
- **WHEN** a text message that is not JSON arrives in a running session
- **THEN** the client receives an `error` and the session keeps running

#### Scenario: Hint request
- **WHEN** a `hint` message arrives for a known sentence
- **THEN** a hint is produced for it

#### Scenario: Hint for an unknown sentence
- **WHEN** a `hint` message arrives with an unknown id
- **THEN** nothing happens and the session keeps running

#### Scenario: Retranslate request
- **WHEN** a `retranslate` message arrives for a known sentence
- **THEN** its translation restarts

### Requirement: Failures never take the server down
Errors while starting a session, failures to close the recognition stream, a recognition stream that fails while it is being opened, and malformed or hostile connection requests SHALL NOT crash the server or leave a session half alive.

#### Scenario: Start fails unexpectedly
- **WHEN** checking the settings or opening recognition throws
- **THEN** the client receives an `error` in Russian, the connection is closed and nothing is logged about the cause beyond an event name

#### Scenario: Recognition fails while opening
- **WHEN** the recognition stream reports a fatal error before it has finished opening
- **THEN** the session ends, the stream is closed, and later audio is not forwarded

#### Scenario: Closing the stream fails
- **WHEN** closing the recognition stream fails
- **THEN** the failure is logged as an event name only and the server keeps running

#### Scenario: Stop during the start check
- **WHEN** `stop` arrives while the settings are still being checked
- **THEN** the client receives `status` `stopped`, the connection is closed and recognition is never opened

#### Scenario: Unparsable request target
- **WHEN** a connection request has a target that cannot be parsed
- **THEN** it is refused and the server keeps serving other connections

#### Scenario: Refused client resets the connection
- **WHEN** a refused client resets its connection
- **THEN** the server does not crash

### Requirement: Only local pages may connect
The server SHALL refuse a WebSocket connection whose `Host` is not `localhost`, `127.0.0.1` or `[::1]`, or whose `Origin` header names a different host than the `Host` header.

#### Scenario: Page from another site
- **WHEN** a browser page from `https://example.com` tries to open `ws://127.0.0.1:8787/ws`
- **THEN** the connection is refused

#### Scenario: Rebound hostname
- **WHEN** a connection arrives with `Host` `attacker.example:8787`
- **THEN** the connection is refused

#### Scenario: The app itself
- **WHEN** the app page served from `http://localhost:5175` or `http://127.0.0.1:8787` opens `/ws` through the dev proxy or directly
- **THEN** the connection is accepted

### Requirement: No conversation data kept or logged
A session SHALL keep its data only in memory for its lifetime, and the server SHALL NOT write transcripts, translations, context or profile text to any log.

#### Scenario: Logging during a session
- **WHEN** a session handles results, a stop, and an error
- **THEN** nothing logged contains any of the recognised text or the start message's context and profile

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
