# Design

## Holding the unfinished tail

The assembler stays pure (no timers). `pushResult` with `speech_final` and `pushUtteranceEnd` no longer flush; `pushUtteranceEnd` only clears the interim text. A new `flush()` emits whatever is buffered.

The session owns the timer. After every recognition result and every `UtteranceEnd` it looks at the assembler's `finalText`: when it is not empty, it (re)starts a 3 s timer that calls `flush()`; when it is empty, it clears the timer. Interim results also restart the timer, because they mean the speaker is still talking; results without text (Deepgram sends empty ones during pauses) leave a running timer alone. The timer flushes only while the session is running: on stop the session calls `flush()` itself after the recognition stream has delivered its last words, and the timer is cleared when the session ends.

The paragrapher measures the pause between sentences. A flushed phrase is sent 3 s or more after its words, so the session passes the time of the last final result with text, and `next(text, at)` uses it instead of the current time.

Why 3 s: in the measured call the continuation after a cut came after 0.9, 1.8 and 1.8 s; two pauses of 4.2 s were real ends of a thought. 3 s joins all three continuations and still shows a lone fragment soon. Only one call was measured, so this is a starting value.

The held text is still shown on the call screen as the live phrase (`finalText`), so the user sees it at once; only the sentence card and its translation wait.

## Entire-screen source

`AudioSource` gets `'screen'`. It uses `getDisplayMedia` like `'tab'`, with `video: { displaySurface: 'monitor' }` (Chrome preselects the "Entire screen" pane) and `systemAudio: 'include'`. The `'tab'` request stays exactly as it was.
