# llm-providers Specification

## Purpose
Lets the rest of the server use Gemini or Claude through one interface, tells the browser which providers and models exist, and rejects session requests that name something unavailable.

## Requirements

### Requirement: Streaming text interface
Every provider SHALL stream the model's answer as an ordered sequence of text chunks for a request that has a model, a system prompt, a user message, a token limit and an optional temperature.

#### Scenario: Chunks arrive in order
- **WHEN** the provider's service returns the text "Привет, мир" in several pieces
- **THEN** the caller receives the same pieces in the same order and their concatenation is "Привет, мир"

#### Scenario: Request limits are passed on
- **WHEN** a request has `maxTokens` 300 and `temperature` 0
- **THEN** the provider's service receives those values

### Requirement: Cancellation
A running stream SHALL stop when the request's abort signal fires, and an abort SHALL NOT be reported as a provider error.

#### Scenario: Abort mid-stream
- **WHEN** the abort signal fires while chunks are being received
- **THEN** the stream ends without an `LlmError`

### Requirement: Error classification
Provider failures SHALL be raised as an `LlmError` whose `kind` is `rate_limit` for HTTP 429, `auth` for 401 and 403, `timeout` for timeouts or HTTP 408 and 504, and `other` for everything else.

#### Scenario: Rate limit
- **WHEN** the provider's service answers with HTTP 429
- **THEN** the caller gets an `LlmError` with kind `rate_limit`

#### Scenario: Invalid key
- **WHEN** the provider's service answers with HTTP 401
- **THEN** the caller gets an `LlmError` with kind `auth`

#### Scenario: Unknown failure
- **WHEN** the provider's service answers with HTTP 500
- **THEN** the caller gets an `LlmError` with kind `other`

### Requirement: Low-latency requests
A request MAY be marked as low-latency (translation and hints), and Gemini SHALL then ask for as little thinking as the model accepts: first the minimal level, then the low level, then no thinking setting; a rejected level (HTTP 400 before any text) SHALL be followed by the next one, and the level that worked SHALL be remembered for that model.

#### Scenario: Model accepts minimal thinking
- **WHEN** a low-latency request is sent to a model that accepts minimal thinking
- **THEN** the request carries the minimal thinking setting

#### Scenario: Model rejects the setting
- **WHEN** the model answers with HTTP 400 before any text
- **THEN** the same request is sent again with the next thinking level and the answer is streamed

#### Scenario: Only the last resort works
- **WHEN** the minimal and the low level are both rejected
- **THEN** the request is repeated without any thinking setting, and later requests for that model start there

#### Scenario: A bad prompt is not blamed on thinking
- **WHEN** every level fails with HTTP 400
- **THEN** the error is reported and nothing is remembered for the model

### Requirement: Model discovery
Each provider SHALL list its models from its API and keep only models that generate text in chat; models for speech, images, music, embeddings, transcription, robotics, computer use, agents and research SHALL be left out.

#### Scenario: Noisy Gemini list
- **WHEN** the Gemini API returns `models/gemini-3.5-flash`, `models/gemini-2.5-flash-preview-tts` and `models/gemini-3-pro-image`
- **THEN** only `gemini-3.5-flash` is offered, without the `models/` prefix

#### Scenario: Listing fails
- **WHEN** the models API call fails
- **THEN** the provider offers its built-in fallback models and the failure is logged without secrets

### Requirement: Default models
For each provider the registry SHALL choose a default translation model (the newest "flash-lite" or "haiku" model, else the newest fast model) and a default hint model: the newest "sonnet" model; else the plain "flash" model of the same generation as the translation model; else the newest plain "flash" model; else the newest "pro" model; else the newest model, where newest means the highest version number in the id.

#### Scenario: Newest lite model wins
- **WHEN** the offered models include `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite`
- **THEN** the default translation model is `gemini-3.5-flash-lite`

#### Scenario: Same generation for hints
- **WHEN** the offered models include `gemini-3.5-flash-lite`, `gemini-3.5-flash` and `gemini-3.8-flash`
- **THEN** the default hint model is `gemini-3.5-flash`

#### Scenario: Plain flash before pro
- **WHEN** the offered models include `gemini-3.5-flash` and `gemini-3.9-pro`
- **THEN** the default hint model is `gemini-3.5-flash`

#### Scenario: Pro for hints
- **WHEN** the offered models include `gemini-3.5-flash-lite` and `gemini-3.1-pro-preview` only, with no plain flash model
- **THEN** the default hint model is `gemini-3.1-pro-preview`

### Requirement: Cached model lists
The model list of a provider SHALL be fetched at most once per ten minutes.

#### Scenario: Repeated config requests
- **WHEN** `/api/config` is requested twice within ten minutes
- **THEN** the provider's models API is called once

### Requirement: Stale list beats built-in list
When refreshing a provider's model list fails and an earlier list was fetched successfully, the registry SHALL keep offering the earlier list and retry after one minute; built-in models SHALL be used only when no list was ever fetched.

#### Scenario: Refresh fails after a good fetch
- **WHEN** the cached list has expired and the next models API call fails
- **THEN** the previous list is still offered

### Requirement: Available providers only
The registry SHALL contain only providers that have an API key, and the public config SHALL list only those.

#### Scenario: Key missing
- **WHEN** no Anthropic key is configured
- **THEN** `/api/config` lists only Gemini and Claude cannot be selected in a session

### Requirement: Start request validation
A `start` request SHALL be rejected with a Russian error message if its provider is not available or if its translation or hint model is not among that provider's models; otherwise it SHALL be accepted.

#### Scenario: Unavailable provider
- **WHEN** a `start` names `anthropic` while only Gemini is available
- **THEN** it is rejected with a message that the provider is unavailable

#### Scenario: Unknown model
- **WHEN** a `start` names a hint model that is not in the provider's list
- **THEN** it is rejected with a message that the model is unknown

#### Scenario: Valid start
- **WHEN** a `start` names an available provider and models from its list
- **THEN** it is accepted
