# Design

## Context

Building blocks exist: `shared/protocol.ts`, `validateStart` (async, needs the registry), `createDeepgramProvider` (callbacks, reconnect, graceful close), `createSentenceAssembler`. In development the browser reaches `/ws` through the Vite proxy, which forwards the browser's `Host` and `Origin` headers (both `localhost:5175`); in production both point at the server itself.

## Goals / Non-Goals

**Goals:**
- A session object that is plain functions over injected pieces (send, close, STT provider, registry, log), so it is tested without sockets.
- One thin endpoint file that adapts `ws` to that object.

**Non-Goals:**
- Translation and hints (next changes); the session leaves one obvious place to add them: where a sentence is emitted.
- Multiple simultaneous sessions policy (each connection is independent; there is one user).

## Decisions

- **`createSession({ send, close, stt, registry, log, startTimeoutMs })` returns `{ onText(raw), onBinary(chunk), onClose() }`.** Pure of sockets; tests drive it with fakes. `stt` is an `SttProvider`, so the Deepgram bridge is replaced by a fake in tests.
- **State machine:** `waiting-for-start` -> `running` -> `ending` -> `done`. Messages in `ending` or `done` are ignored. Start validation is async, so the state is set to `starting` immediately to reject a second `start` and any audio that races it.
- **Audio during validation:** a chunk arriving while `start` is being validated would be lost; the browser only begins recording after it sees `status`, so such chunks are treated as a protocol error only before the first `start` was seen, and dropped during `starting`.
- **Stop flow:** `await stream.close()` (results still arrive through the handlers), then flush the assembler with `pushUtteranceEnd()` and send those sentences, then `status stopped`, then close the socket.
- **Fatal STT errors** map to fixed Russian texts (key rejected / could not connect) and end the session like `stop` but without waiting.
- **Origin protection in `wsEndpoint.ts`:** `ws` with `noServer: true`; the HTTP server's `upgrade` event checks the path (`/ws`), the `Host` (must be `localhost`, `127.0.0.1` or `[::1]`, any port) and the `Origin` (if present, its host must equal the `Host` header). Blocks cross-site WebSocket hijacking and DNS rebinding. A missing `Origin` (non-browser tools) is allowed because browsers always send one on WebSocket handshakes. Alternative: a random token; rejected as heavier for a local tool.
- **`maxPayload` 1 MiB** on the WebSocket server: audio chunks are a few KB, and a limit stops memory abuse.
- **Logging:** the session logs event names only (`session_start provider=... model=...`, `session_stop`, `session_error code`), never text; the model and provider names are logged so criterion 8 of the spec (models visible in the log) holds.

## Risks / Trade-offs

- [`Origin` check blocks a legitimate non-standard setup, e.g. accessing the app through a LAN name] → the server only listens on loopback anyway; `Host` must be local.
- [A started session whose browser tab freezes keeps a Deepgram connection until the socket closes] → `ws` detects the closed socket; a ping/pong heartbeat can be added later if it proves necessary.

## Open Questions

None that change the specs or tasks.
