# Spec Delta

## Purpose

Defines how a developer installs, runs, builds and tests the application locally, including the ports and the local-only network binding.

## ADDED Requirements

### Requirement: Single-command development run
The system SHALL start both the server and the web dev server with `npm run dev` after `npm install`.

#### Scenario: Dev ports
- **WHEN** `npm run dev` is running
- **THEN** the server listens on port 8787 and the web dev server on port 5175, and requests to `/ws` and `/api` on 5175 are forwarded to the server

#### Scenario: Port is configurable
- **WHEN** `WEB_PORT` is set in `.env`
- **THEN** the web dev server uses that port instead of 5175

### Requirement: Local-only binding
The server SHALL listen only on `127.0.0.1`.

#### Scenario: Not reachable from the network
- **WHEN** the server is running
- **THEN** it does not accept connections on any non-loopback address

### Requirement: Production run in one process
The system SHALL build the web app and serve it from the server process on port 8787 via `npm run build` followed by `npm start`.

#### Scenario: Built app is served
- **WHEN** the build has finished and `npm start` is running
- **THEN** `http://127.0.0.1:8787/` returns the web app and `/api/config` is served by the same process

### Requirement: Unified test command
The system SHALL run the tests of all workspaces with `npm test`.

#### Scenario: Tests run from the root
- **WHEN** `npm test` is run in the repository root
- **THEN** Vitest runs tests from `shared`, `server` and `web` and the exit code reflects the result

### Requirement: Secrets stay out of the repository
The repository SHALL contain `.env.example` with empty key values and SHALL ignore `.env` from the first commit.

#### Scenario: Env file ignored
- **WHEN** a `.env` file exists in the working tree
- **THEN** `git status` does not list it as untracked

#### Scenario: Example has no values
- **WHEN** `.env.example` is read
- **THEN** every `*_API_KEY` variable is empty
