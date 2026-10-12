# Spec Delta

## Purpose

Turns the audio of a call into a live stream of recognition events through a speech-to-text service, and keeps that stream healthy across silences and short network failures.

## ADDED Requirements

### Requirement: Connection parameters
The system SHALL connect to the service's live endpoint with the configured model, the language chosen for the call (`de`, `en` or `multi`), interim results, smart formatting, punctuation, an endpointing time of 300 ms, an utterance end time of 1000 ms and voice-activity events, and SHALL authenticate with the API key in an `Authorization` header and not in the URL.

#### Scenario: Query parameters
- **WHEN** a recognition stream is opened for language `multi` with model `nova-3`
- **THEN** the URL carries `model=nova-3`, `language=multi`, `interim_results=true`, `smart_format=true`, `punctuate=true`, `endpointing=300`, `utterance_end_ms=1000` and `vad_events=true`

#### Scenario: No audio format parameters
- **WHEN** a recognition stream is opened
- **THEN** the URL has no `encoding` and no `sample_rate`

#### Scenario: Key placement
- **WHEN** a recognition stream is opened
- **THEN** the key is sent as `Authorization: Token <key>` and does not appear in the URL

### Requirement: Audio forwarding and early buffering
Audio chunks SHALL be sent to the service unchanged, in order; chunks received before the connection opens SHALL be held and sent first once it opens, and at most five seconds of audio SHALL be held.

#### Scenario: Chunk sent after the connection is open
- **WHEN** the connection is open and a chunk arrives
- **THEN** the same bytes are sent as a binary message

#### Scenario: Chunks wait for the connection
- **WHEN** three chunks arrive before the connection opens
- **THEN** all three are sent in order when it opens

#### Scenario: Too much waiting audio
- **WHEN** more than five seconds of chunks arrive before the connection opens
- **THEN** the held chunks are dropped and the caller is asked to restart the recorder

### Requirement: Keep-alive during silence
The system SHALL send a `KeepAlive` text message when no audio has been sent for four seconds.

#### Scenario: Quiet browser
- **WHEN** four seconds pass without audio on an open connection
- **THEN** `{"type":"KeepAlive"}` is sent as a text message

#### Scenario: Audio flowing
- **WHEN** audio is sent at least every second
- **THEN** no `KeepAlive` is sent

### Requirement: Recognition events
The system SHALL report each transcription result with its text, whether it is final and whether the speech is final, report utterance ends, and report the start of speech; it SHALL ignore an utterance end whose last word end is -1.

#### Scenario: Interim and final results
- **WHEN** the service sends a result with `is_final` false and then one with `is_final` true and `speech_final` true
- **THEN** the caller receives both, with the same flags and the first alternative's transcript

#### Scenario: Utterance end
- **WHEN** the service sends `UtteranceEnd` with a `last_word_end` of 2.4
- **THEN** the caller is told an utterance ended

#### Scenario: Premature utterance end
- **WHEN** the service sends `UtteranceEnd` with `last_word_end` -1
- **THEN** the caller is not told

#### Scenario: Speech started
- **WHEN** the service sends `SpeechStarted`
- **THEN** the caller is told speech started

### Requirement: Graceful close
Closing a stream SHALL send `{"type":"CloseStream"}`, keep delivering results until the service closes the connection or two seconds have passed, and then close the connection.

#### Scenario: Results in flight
- **WHEN** the stream is closed while a final result is still on its way
- **THEN** the caller still receives that result before the stream is finished

#### Scenario: Service does not answer
- **WHEN** the service does not close the connection within two seconds after `CloseStream`
- **THEN** the connection is closed anyway and no more events are delivered

### Requirement: Reconnecting
After an unexpected loss of the connection the system SHALL tell the caller it is reconnecting and retry after 0.5, 1, 2, 4 and 8 seconds, and after a successful reconnect SHALL ask the caller to restart the recorder; after the fifth failed attempt it SHALL report a fatal error.

#### Scenario: Quick recovery
- **WHEN** the connection drops and the first retry succeeds
- **THEN** the caller is told it is reconnecting, then that the connection is open again, and is asked to restart the recorder

#### Scenario: Audio during an outage
- **WHEN** chunks arrive while reconnecting
- **THEN** they are discarded, because they would not start with a container header

#### Scenario: Giving up
- **WHEN** five consecutive retries fail
- **THEN** a fatal error is reported and no further retries happen

### Requirement: Fresh recording after a restart
After asking the caller to restart the recorder (after a reconnect, or after dropping held audio), the system SHALL discard chunks until one begins with the webm header bytes `1A 45 DF A3`, and then forward audio normally.

#### Scenario: Old chunks still arriving
- **WHEN** the recorder restart was requested and two chunks from the old recording arrive, followed by a chunk starting with the webm header and a normal chunk
- **THEN** only the header chunk and the normal chunk after it are sent

### Requirement: Healthy connections reset the retry schedule
A connection that stayed open for five seconds, or delivered a message, SHALL count as healthy, so that a later loss starts again at the shortest delay; connections that open and drop at once SHALL NOT reset it.

#### Scenario: Quiet but stable call
- **WHEN** a connection stays open for five seconds without any message and then drops
- **THEN** the retry happens after 0.5 s

#### Scenario: Flapping connection
- **WHEN** five consecutive connections open and immediately drop
- **THEN** a fatal error is reported

### Requirement: Closing is clean and repeatable
Closing a stream SHALL leave no connection open, including an attempt that was still connecting during an outage, and closing twice SHALL send a single `CloseStream` and give the same result.

#### Scenario: Close during an attempt
- **WHEN** the stream is closed while a reconnect attempt is still connecting
- **THEN** that attempt is terminated and its later events are ignored

#### Scenario: Double close
- **WHEN** close is called twice
- **THEN** one `CloseStream` is sent and both calls finish together

### Requirement: Requests that cannot succeed are fatal
An HTTP 4xx answer when connecting, other than 408 and 429, SHALL be reported as a fatal error with kind `connection` and not retried.

#### Scenario: Bad request
- **WHEN** the service answers the connection request with HTTP 400
- **THEN** a fatal error is reported and no retry is scheduled

#### Scenario: Busy service
- **WHEN** the service answers with HTTP 429 or 503
- **THEN** the system retries after the usual delay

### Requirement: Rejected key is fatal
An authentication failure (HTTP 401 or 403 when connecting) SHALL be reported as a fatal error at once, without retries.

#### Scenario: Invalid key
- **WHEN** the service rejects the connection with HTTP 401
- **THEN** a fatal error with kind `auth` is reported and no retry is scheduled

### Requirement: No conversation text in logs
The system SHALL NOT write transcripts to any log.

#### Scenario: Logging a result
- **WHEN** a result is received
- **THEN** nothing containing its transcript is logged
