# audio-capture Specification

## Purpose
Defines how the browser obtains the call's audio from a Chrome tab or the microphone and turns it into small chunks for the server.

## Requirements

### Requirement: Tab capture needs audio
Capturing a tab SHALL request screen sharing with audio, and SHALL stop all obtained tracks and fail with a clear Russian message if no audio track came with it.

#### Scenario: Audio shared
- **WHEN** the user picks a tab and ticks "Also share tab audio"
- **THEN** capture starts

#### Scenario: Audio not shared
- **WHEN** the user picks a tab without sharing its audio
- **THEN** all tracks are stopped and the error says to choose a Chrome tab and enable sharing its audio

### Requirement: Audio only, video untouched
Only the audio tracks SHALL be recorded and sent; the video track SHALL stay unused and running until the capture ends.

#### Scenario: Recorder input
- **WHEN** capture starts from a stream with a video and an audio track
- **THEN** the recorder receives a stream with the audio track only and the video track is not stopped

### Requirement: Chunked webm/opus
Audio SHALL be recorded as `audio/webm;codecs=opus` and delivered in chunks of 250 ms.

#### Scenario: Recorder settings
- **WHEN** recording starts
- **THEN** the recorder is created with mime type `audio/webm;codecs=opus` and started with a 250 ms time slice

#### Scenario: Chunk delivery
- **WHEN** the recorder produces data
- **THEN** the caller receives the bytes of each non-empty chunk in order

### Requirement: Restartable recording
Recording SHALL be restartable on the same audio stream, so that the next chunk starts a new recording with a fresh container header.

#### Scenario: Restart
- **WHEN** the recording is restarted
- **THEN** the old recorder is stopped and a new one is started on the same audio tracks

### Requirement: Failures do not stop the stream
A chunk that cannot be read or handled SHALL NOT stop later chunks from being delivered, and starting or restarting after the capture was stopped SHALL do nothing.

#### Scenario: One bad chunk
- **WHEN** one chunk fails to be read
- **THEN** the next chunk is still delivered

#### Scenario: Use after stop
- **WHEN** a restart is requested after the capture was stopped
- **THEN** no recorder is created

### Requirement: Microphone source
The microphone source SHALL request audio only and otherwise behave like tab capture.

#### Scenario: Microphone
- **WHEN** the source is the microphone
- **THEN** audio is requested without video and recording works the same way

#### Scenario: Microphone without audio
- **WHEN** the microphone stream has no audio track
- **THEN** the error talks about the microphone, not about sharing a tab

### Requirement: Ending sharing ends the capture
When any captured track ends, for example because the user clicked "Stop sharing", the caller SHALL be told so exactly once.

#### Scenario: User stops sharing
- **WHEN** a captured track ends
- **THEN** the end callback is called once

### Requirement: Clean stop
Stopping SHALL stop the recorder and every track, including video, and release the capture, and stopping twice SHALL be harmless.

#### Scenario: Stop
- **WHEN** the capture is stopped
- **THEN** the recorder and all tracks are stopped and later chunks are not delivered

### Requirement: Understandable failures
A refused permission or missing device SHALL be reported with a Russian message and without leaving tracks running.

#### Scenario: Permission refused
- **WHEN** the user refuses the sharing dialog
- **THEN** capture fails with a message that access was not granted
