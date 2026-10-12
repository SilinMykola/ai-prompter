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

### Requirement: Live text and sentences
The session SHALL feed recognition results through the sentence assembler, send each finished sentence as `sentence` with its increasing id, and send the unfinished phrase as `interim` with `finalText` and `interimText`.

#### Scenario: Sentence from final result
- **WHEN** a final result "Guten Tag. Wie geht" arrives
- **THEN** the client receives `sentence` id 1 "Guten Tag." and `interim` with `finalText` "Wie geht"

#### Scenario: Interim result
- **WHEN** an interim result "Wie geht es" arrives
- **THEN** the client receives `interim` with that text as `interimText` and no `sentence`

#### Scenario: Utterance end flushes
- **WHEN** an utterance end arrives while "Ich komme gleich" is unfinished
- **THEN** the client receives `sentence` "Ich komme gleich" and an empty `interim`

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
