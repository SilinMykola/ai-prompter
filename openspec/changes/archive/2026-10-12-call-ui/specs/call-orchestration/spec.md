# Spec Delta

## Purpose

Defines how the pieces of a call work together: when audio starts flowing, what happens after an outage, how a call ends, and what the user is told along the way.

## ADDED Requirements

### Requirement: Recording follows the server
The recorder SHALL start only after the server has accepted the session, and its chunks SHALL go to the server; after a reconnect or when the server asks for a restart the recorder SHALL restart.

#### Scenario: First session
- **WHEN** the server accepts the session
- **THEN** recording starts and chunks are sent

#### Scenario: Before acceptance
- **WHEN** the session has not been accepted yet
- **THEN** no recording is running

#### Scenario: Restart on request
- **WHEN** the server sends `restart_recorder`
- **THEN** the recorder restarts

#### Scenario: Reconnect
- **WHEN** the connection was lost and a new session is accepted
- **THEN** the screen state marks a new session and the recorder restarts

### Requirement: Everything is released at the end
Stopping the call, the user ending screen sharing, the server ending the session, or giving up on reconnecting SHALL stop the recorder, release the shared tab or microphone and close the connection, and the screen SHALL show the state "остановлено".

#### Scenario: Stop button
- **WHEN** the user presses stop
- **THEN** capture is released, the server is told to stop, and the state becomes stopped

#### Scenario: Sharing ended in the browser
- **WHEN** the user clicks "Stop sharing" in the browser
- **THEN** the call stops as if stop was pressed

#### Scenario: Server ended the session
- **WHEN** the server sends an error and closes
- **THEN** capture is released and the error stays visible

#### Scenario: No connection
- **WHEN** all reconnect attempts fail
- **THEN** capture is released, the state is stopped and the error says the connection to the server was lost

### Requirement: Outage handling
During an outage the recording SHALL keep running, the cards SHALL stay on screen, and the state SHALL read "переподключение…"; chunks produced meanwhile SHALL be dropped.

#### Scenario: Short outage
- **WHEN** the connection drops
- **THEN** the state becomes reconnecting and the existing cards remain

### Requirement: Requests for old cards
When a hint or translation request cannot be sent, the user SHALL be told briefly why in the page, without a modal window, and the notice SHALL disappear after a few seconds.

#### Scenario: Card from an earlier connection
- **WHEN** the user asks for a hint on a card from before a reconnect
- **THEN** a short notice says that card is no longer available

### Requirement: Start errors are returned
If audio cannot be obtained when starting, the orchestrator SHALL fail without opening a connection, so that the setup screen can show the reason.

#### Scenario: Refused sharing
- **WHEN** the user refuses the share dialog
- **THEN** no connection is opened and the error is passed on

### Requirement: Failures during a call are visible
If the recorder cannot start or restart, or closing the connection fails, the call SHALL end with an explanation instead of hanging, and if opening the connection fails after audio was obtained, the audio SHALL be released.

#### Scenario: Recorder cannot start
- **WHEN** the recorder fails to start after the session was accepted
- **THEN** the screen shows the reason, the state becomes stopped and capture is released

#### Scenario: Connection cannot be opened
- **WHEN** opening the connection throws after audio was obtained
- **THEN** the audio is released and the error is passed on

### Requirement: One start at a time
While a start is in progress the start button SHALL be disabled, a second start SHALL be ignored, and a call that finishes starting after the page was closed SHALL be stopped at once.

#### Scenario: Double click
- **WHEN** the start button is pressed twice quickly
- **THEN** only one call is started
