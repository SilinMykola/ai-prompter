# Spec Delta

## MODIFIED Requirements

### Requirement: Tolerance to bad input
Messages that are not valid JSON or have an unknown type SHALL NOT crash the session; `hint` SHALL be accepted and ignored until it is implemented, and `retranslate` SHALL restart the translation of a known sentence.

#### Scenario: Garbage text
- **WHEN** a text message that is not JSON arrives in a running session
- **THEN** the client receives an `error` and the session keeps running

#### Scenario: Hint request
- **WHEN** a `hint` message arrives
- **THEN** nothing happens and the session keeps running

#### Scenario: Retranslate request
- **WHEN** a `retranslate` message arrives for a known sentence
- **THEN** its translation restarts
