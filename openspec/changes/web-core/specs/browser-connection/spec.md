# Spec Delta

## Purpose

Describes how the browser keeps a connection to the server during a call, including starting a session, recovering from short outages, and keeping sentence ids unique across server sessions.

## ADDED Requirements

### Requirement: Start message first
After the connection opens the client SHALL send `start` with the chosen settings as the first message, before any audio.

#### Scenario: Opening
- **WHEN** the connection opens
- **THEN** the first thing sent is a `start` message with language, provider, models, call context and profile

#### Scenario: Audio waits for the session
- **WHEN** audio chunks are produced while the connection is not open
- **THEN** they are dropped and not queued

### Requirement: Reconnecting
After an unexpected loss the client SHALL reconnect up to five times, waiting 0.5, 1, 2, 4 and 8 seconds, send a new `start` on each successful connection, and ask for the recorder to be restarted; after five failures it SHALL report that it gave up.

#### Scenario: Lost and restored
- **WHEN** the connection drops and the first retry succeeds
- **THEN** a new `start` is sent, the caller is told the session is new and the recorder must restart

#### Scenario: Giving up
- **WHEN** five retries fail in a row
- **THEN** the caller is told it gave up and no more retries happen

#### Scenario: Schedule resets
- **WHEN** a restored connection stays up and drops again later
- **THEN** the waiting starts again at 0.5 seconds

### Requirement: Unique sentence ids
Sentence ids from a later server session SHALL be shifted so that they never equal the ids of earlier cards, and requests for a card SHALL use the id the server knows.

#### Scenario: Ids after a reconnect
- **WHEN** cards 1 to 3 exist and the new server session sends sentence id 1
- **THEN** the caller receives a sentence with id 4

#### Scenario: Request for a current card
- **WHEN** the user asks for a hint on card 5 and the current session started after card 3
- **THEN** the server receives a hint request for id 2

#### Scenario: Request for an old card
- **WHEN** the user asks for a hint on card 2 and the current session started after card 3
- **THEN** nothing is sent and the caller is told the card is no longer available

### Requirement: Orderly stop
Stopping SHALL send `stop`, wait for the server to close the connection or two seconds, and then close the socket without reconnecting.

#### Scenario: Stop
- **WHEN** the user stops the call
- **THEN** `stop` is sent and no reconnect is attempted afterwards

### Requirement: Server errors are passed on
Messages from the server SHALL be delivered to the caller after id shifting, in order of arrival.

#### Scenario: Error message
- **WHEN** the server sends `error`
- **THEN** the caller receives it unchanged
