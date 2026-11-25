# Spec Delta

## ADDED Requirements

### Requirement: Speaker numbers
The system SHALL ask the service for speaker numbers (`diarize=true`) and SHALL report with each result the speaker number held by most of its words; a result whose words carry no speaker number SHALL be reported without one.

#### Scenario: Diarization requested
- **WHEN** a recognition stream is opened
- **THEN** the URL carries `diarize=true`

#### Scenario: Speaker of a result
- **WHEN** the service sends a result with one word of speaker 0 followed by three words of speaker 1
- **THEN** the result is reported with speaker 1

#### Scenario: No words
- **WHEN** the service sends a result without words
- **THEN** the result is reported without a speaker

#### Scenario: Tie
- **WHEN** the service sends a result with two words of speaker 1 and two of speaker 0, speaker 1 first
- **THEN** the result is reported with speaker 1
