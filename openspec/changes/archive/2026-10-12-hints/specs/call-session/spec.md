# Spec Delta

## MODIFIED Requirements

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
