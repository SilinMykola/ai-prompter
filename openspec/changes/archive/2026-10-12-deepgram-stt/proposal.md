# Proposal

## Why

The app is useless without text: the sentence assembler and everything after it need a live stream of recognition results. SPEC.md asks for a speech-to-text provider interface with one implementation, Deepgram streaming over a raw WebSocket, that survives short network drops. This is the last big server building block before the call session can be wired together.

## What Changes

- Add an `SttProvider` interface and a Deepgram implementation that opens `wss://api.deepgram.com/v1/listen` with the required query parameters and `Authorization` header.
- Forward browser audio chunks as they come; hold the first chunks while the connection is still opening (at most 5 seconds).
- Keep the connection alive during silence, close it politely (`CloseStream`), and deliver results that were still in flight.
- Report recognition results, `UtteranceEnd` and `SpeechStarted` through callbacks; tolerate the odd `UtteranceEnd` with `last_word_end` of -1.
- Reconnect after an unexpected drop (0.5, 1, 2, 4, 8 seconds, five tries), tell the caller, and ask it to restart the audio recorder because a new connection needs a fresh container header; fail at once on a rejected key.
- Documentation facts verified while planning (docs and a live call with the project's key): `language=multi` on Nova-3 covers German and English in streaming; `utterance_end_ms` needs `interim_results=true` and at least 1000; `KeepAlive` is a text frame and the server closes the connection after 10 seconds without audio or `KeepAlive`.
- Out of scope: the WebSocket session towards the browser, sentence assembly wiring, translation, any UI.

## Capabilities

### New Capabilities
- `speech-recognition`: how the server turns an audio stream into recognition events through the speech-to-text service, including keep-alive, closing and reconnecting.

### Modified Capabilities

## Impact

- New files in `server/src/stt/` (`types.ts`, `deepgram.ts`) and tests; no new dependencies (`ws` is already installed).
- README gets a short note on the Deepgram parameters and a documented deviation (`KeepAlive` every 4 seconds instead of 5).
