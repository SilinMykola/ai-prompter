# Tasks

## 1. Interface and connection

- [x] 1.1 Define `SttProvider`, `SttStream`, `SttHandlers` and `SocketLike` in `server/src/stt/types.ts`; write failing tests in `server/src/stt/deepgram.test.ts` (fake socket, fake timers) for the URL parameters, no `encoding`/`sample_rate`, key only in the `Authorization` header, chunks forwarded in order and unchanged, chunks held until open and sent in order, and overflow beyond 5 seconds dropping the buffer and asking for a recorder restart; verify they fail
- [x] 1.2 Implement `createDeepgramProvider` in `server/src/stt/deepgram.ts` (connection, forwarding, early buffer); verify the tests pass
- [x] 1.3 Break the buffer order and the header placement in turn, verify the tests fail, restore

## 2. Events, keep-alive and closing

- [ ] 2.1 Write failing tests for result mapping (interim and final flags, first alternative), `UtteranceEnd` mapping and the -1 case, `SpeechStarted`, `KeepAlive` as a text message after 4 seconds of silence and not while audio flows, `CloseStream` on close, results delivered while closing, and the 2-second close timeout; verify they fail
- [ ] 2.2 Implement message parsing, the keep-alive timer and `close()`; verify the tests pass
- [ ] 2.3 Make malformed or unknown messages harmless (a test for non-JSON text and an unknown `type`); verify
- [ ] 2.4 Break the -1 filter and the keep-alive reset in turn, verify the tests fail, restore

## 3. Reconnecting and failures

- [ ] 3.1 Write failing tests for the reconnect schedule 0.5/1/2/4/8 s, `onReconnecting`, `onOpen` and `onRestartRecorder` after recovery, audio discarded while reconnecting, giving up with `onFatal` after five failures, the counter resetting after a good connection, no reconnect after `close()`, and HTTP 401 as an immediate fatal error with kind `auth`; verify they fail
- [ ] 3.2 Implement reconnecting and failure handling; verify all tests in the file pass
- [ ] 3.3 Add a test that no transcript text reaches the `log` callback or `console` during a run; verify, then break it by logging a result and see it fail, restore
- [ ] 3.4 Break the retry limit and the auth handling in turn, verify tests fail, restore

## 4. Live check and wrap-up

- [ ] 4.1 Run a manual check with the real key: stream the synthesised German WAV through `createDeepgramProvider`, see interim and final results, close gracefully, and confirm no key or text in the logs
- [ ] 4.2 Document the Deepgram settings and the keep-alive deviation in the README; run `npm test`, `npm run typecheck` and the code-review skill; fix findings
