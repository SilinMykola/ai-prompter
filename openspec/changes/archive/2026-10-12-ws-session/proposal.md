# Proposal

## Why

Everything the server needs is built but unconnected: the protocol types, the Deepgram stream, the sentence assembler and the start validation. The browser needs one WebSocket endpoint where a call session lives: it starts with the user's settings, receives audio, and gets back status, live text and finished sentences. This also fixes a security gap that appears the moment the endpoint exists: the server listens only on `127.0.0.1`, but any web page open in the user's browser could still connect to it and spend the user's API keys.

## What Changes

- Add a WebSocket endpoint `/ws`; one connection is one call session (SPEC.md sections 4 and 8).
- The first message must be a valid `start`; it opens a speech-recognition stream for the chosen language.
- Audio frames go to the stream; results go through the sentence assembler and come back as `interim` and `sentence` messages; Deepgram events become `status` messages (`connecting`, `listening`, `speaking`, `reconnecting`, `stopped`) and `restart_recorder`.
- `stop`, a closed connection, or a fatal recognition error end the session cleanly, flushing the last words first, and drop all session data.
- Only pages served from the local machine may open a session: connections with a foreign `Origin` or a non-local `Host` are refused.
- Out of scope: translation, hints (`hint` and `retranslate` messages are accepted and ignored until their own changes), the browser side.

## Capabilities

### New Capabilities
- `call-session`: lifecycle and message flow of one call session over the WebSocket, and who may open it.

### Modified Capabilities

## Impact

- New files: `server/src/session.ts`, `server/src/wsEndpoint.ts` and tests; `server/src/server.ts` and `index.ts` wire them in.
- No new dependencies (`ws` is installed).
- README: a short description of the endpoint and the origin rule.
