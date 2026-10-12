# Design

## Context

Facts established while planning (documentation plus a real call with the project's key, using German speech synthesised on this machine):

- Streaming works with `model=nova-3`, both `language=de` and `language=multi`; messages seen: `Results`, `SpeechStarted`, `Metadata`. Results carry `is_final`, `speech_final` and `channel.alternatives[0].transcript`.
- `multi` supports ten languages including English and German in streaming.
- `UtteranceEnd` needs `interim_results=true` and `utterance_end_ms >= 1000`; `last_word_end: -1` means "finalised too early, ignore".
- `KeepAlive` must be a **text** frame (a binary frame may be mishandled); without audio or `KeepAlive` for 10 seconds the connection is closed.
- Containerised audio (the browser sends webm/opus) must not set `encoding`/`sample_rate`; the docs describe this for containers in general and do not name webm explicitly, so webm/opus is confirmed only by the end-to-end test with a browser.
- No `ffmpeg` here, so the live test used WAV; the webm path is verified later with the real browser.

## Goals / Non-Goals

**Goals:**
- A small `SttProvider` interface (SPEC.md section 6.1) so another engine could be added later.
- Behaviour that can be tested deterministically: fake socket, fake timers.

**Non-Goals:**
- The browser-facing session and message translation (next change).
- Smart handling of partial webm clusters.

## Decisions

- **Interface:** `SttProvider.open({ language }, handlers) -> SttStream`, where `SttStream` has `send(chunk: Uint8Array)` and `close(): Promise<void>`. Handlers: `onOpen`, `onResult`, `onUtteranceEnd`, `onSpeechStarted`, `onReconnecting`, `onRestartRecorder`, `onFatal`. Callbacks over events/streams keep the session code flat and easy to fake.
- **Socket injected** as a factory `(url, headers) => SocketLike` (the `ws` class by default). Tests pass a fake socket and use fake timers, so reconnect delays and keep-alive run without real waiting.
- **Buffer before open:** chunks are 250 ms each (SPEC.md section 5.2), so "five seconds" is 20 chunks. Dropping only the oldest chunks would drop the first one, which holds the container header and makes the rest undecodable, so on overflow the whole buffer is dropped and a recorder restart is requested (the same recovery path as reconnecting). Alternative (keep header, drop the middle) rejected as fragile.
- **While reconnecting, audio is discarded** for the same header reason; after the reconnect `onRestartRecorder` makes the browser send a fresh header.
- **KeepAlive every 4 seconds of silence** (docs recommend 3-5 s and the server drops at 10 s; SPEC.md said 5 s, which leaves less margin). The timer restarts on every audio send. Documented as a deviation.
- **Close:** send `CloseStream`, wait for the server's close or two seconds, then terminate. Results arriving in that window are still delivered, because the last words of a call are often in them.
- **Auth failure:** the `ws` library surfaces HTTP errors during the upgrade as `unexpected-response`; 401/403 are fatal, other statuses count as a normal failed attempt.
- **Reset of the retry counter** after a connection that stayed open and delivered at least one message; five consecutive failures give up. Delays 0.5, 1, 2, 4, 8 s.
- **Logging:** the provider takes an optional `log(event)` that only receives event names and codes. Transcripts never reach it.

## Risks / Trade-offs

- [webm/opus not auto-detected by the service] → documented as unverified; fall back plan is to send `encoding=opus` in a later change if the end-to-end test fails.
- [Dropping the whole early buffer loses up to 5 s of speech] → only happens when the connection takes more than 5 s to open, which is also when the user has bigger problems.
- [Reconnect loses speech during the outage] → inherent; the transcript simply resumes.

## Open Questions

None that change the specs or tasks.
