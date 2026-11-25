# Spec Delta

## ADDED Requirements

### Requirement: Entire-screen capture needs system audio
Capturing the entire screen SHALL request screen sharing with the entire screen preselected (`displaySurface: 'monitor'`) and system audio included (`systemAudio: 'include'`), and SHALL stop all obtained tracks and fail with a clear Russian message if no audio track came with it. Capturing a tab SHALL keep requesting `{ video: true, audio: true }`.

#### Scenario: Request for the entire screen
- **WHEN** capture starts with the source `screen`
- **THEN** the browser is asked for `{ video: { displaySurface: 'monitor' }, audio: true, systemAudio: 'include' }`

#### Scenario: System audio not shared
- **WHEN** the user shares the entire screen without system audio
- **THEN** all tracks are stopped and the error says to choose the entire screen and enable sharing system audio

#### Scenario: Tab request unchanged
- **WHEN** capture starts with the source `tab`
- **THEN** the browser is asked for `{ video: true, audio: true }`
