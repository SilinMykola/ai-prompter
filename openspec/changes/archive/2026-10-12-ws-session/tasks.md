# Tasks

## 1. Session start and audio

- [x] 1.1 Write failing tests in `server/src/session.test.ts` (fake `send`/`close`, fake STT provider capturing handlers, fake registry) for: valid `start` giving `status connecting` and a stream opened with the right language; invalid `start` giving a Russian `error` and close; audio before `start`; no `start` within 10 s (fake timers); a second `start`; audio forwarded unchanged; audio during validation dropped; verify they fail
- [x] 1.2 Implement `createSession` start handling and audio forwarding in `server/src/session.ts`; verify the tests pass
- [x] 1.3 Break the first-message rule and the start timeout in turn, verify the tests fail, restore

## 2. Status and text relay

- [x] 2.1 Write failing tests for `status` mapping (open, speech started, utterance end, reconnecting, reopened with `restart_recorder`), `sentence` and `interim` messages from final and interim results, utterance-end flush, increasing ids; verify they fail
- [x] 2.2 Implement the relay; verify the tests pass
- [x] 2.3 Break the interim message and the utterance-end flush in turn, verify the tests fail, restore

## 3. Ending a session

- [x] 3.1 Write failing tests for `stop` with a result arriving during close (sentence, then `stopped`, then close), connection closed by the browser, fatal STT errors (`auth` and `connection`) with Russian errors, garbage text, unknown types, ignored `hint`/`retranslate`, and that nothing is sent after the session is done; verify they fail
- [x] 3.2 Implement stop, close and failure handling; verify the tests pass
- [x] 3.3 Add a test that logs, `console` output and sent errors never contain recognised text, context or profile (run a session with distinctive strings); verify, then break it by logging a sentence and see it fail, restore

## 4. Endpoint and origin check

- [x] 4.1 Write failing tests in `server/src/wsEndpoint.test.ts` with a real `ws` client against a real server on port 0 and a fake STT: accepted for `Host` 127.0.0.1 and no `Origin`; accepted with matching local `Origin`; refused for a foreign `Origin`; refused for a non-local `Host`; refused for another path; a full flow `start` -> audio -> sentence -> `stop`; verify they fail
- [x] 4.2 Implement `server/src/wsEndpoint.ts` and attach it in `server/src/server.ts`; verify the tests pass
- [x] 4.3 Break the origin check and the host check in turn, verify the tests fail, restore

## 5. Wiring and live check

- [x] 5.1 Wire the real Deepgram provider and registry in `server/src/index.ts`; verify `npm run typecheck`
- [x] 5.2 Run a live check: start the real server, connect with a `ws` client from a script, send `start` (default models) and the synthesised German WAV, and see `status`, `interim`, `sentence` and `stopped` messages; check the server log has event names only
- [x] 5.3 Document the endpoint and the origin rule in the README; run `npm test`, `npm run typecheck` and the code-review skill; fix findings
