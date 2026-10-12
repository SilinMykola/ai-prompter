# Spec Delta

## ADDED Requirements

### Requirement: The end of the call fails unfinished work
When the status becomes `stopped`, every translation that has not finished and every hint that is still streaming SHALL be marked failed, keeping the text received so far, because nothing more will arrive.

#### Scenario: Stopped while streaming
- **WHEN** a card has a streaming translation and a streaming hint and the status becomes `stopped`
- **THEN** both are marked failed and their text so far stays

#### Scenario: Finished work stays
- **WHEN** the status becomes `stopped`
- **THEN** completed translations and hints are unchanged

#### Scenario: Other status changes
- **WHEN** the status becomes `reconnecting`
- **THEN** no card changes
