# Proposal

## Why

The first live call through the Zoom desktop app (2026-11-25, developer log of 160 s) showed three problems:

- Sound from the Zoom app can be captured: Chrome's share dialog offers "Entire screen" with system audio. But the setup screen only offers "Chrome tab" and "Microphone", and the error text tells the user to pick a tab.
- Sentences are cut in the middle. Deepgram reports the end of an utterance (`UtteranceEnd` or `speech_final`) on a short pause inside a sentence, and the assembler then emits the unfinished text at once, for example "Also und dann das ist meine Einleitung zum" and "Forumsbeitrag." as two sentences, each translated badly. In the log, 5 such cuts happened; the speaker went on after 0.9, 1.8 and 1.8 s in three of them, and after 4.2 s in the other two.
- The default translation model `gemini-2.5-flash` answers HTTP 429 (quota exceeded) on the user's key, so no sentence was translated until the user picked another model by hand. `gemini-flash-lite-latest` answered a single test request in 0.8 s and then translated 87 of 89 sentences of the call, with a median of 2.3 s to the first word; the other 2 hit the free-tier rate limit.

## What Changes

- A third audio source, "Весь экран / приложение (Zoom)": the share dialog opens with "Entire screen" preselected and system audio requested; without audio the error says to choose the entire screen and enable system audio.
- An unfinished tail (text without closing punctuation) is no longer emitted when the speaker pauses. The session emits it only after 3 seconds without newly recognised words or an utterance end, or when the call stops; it keeps the paragraph of the time it was spoken. Text that continues within that time joins the same sentence.
- The preferred default translation model becomes `gemini-flash-lite-latest` when offered.
- README updated.
- Out of scope: telling speakers apart, falling back to another model on a rate limit.

## Capabilities

### New Capabilities

### Modified Capabilities
- `sentence-assembly`: end of speech no longer flushes the tail; an explicit flush is added.
- `call-session`: the session flushes a held tail after 3 s of silence and on stop.
- `llm-providers`: the preferred default translation model.
- `audio-capture`: the entire-screen source.
- `setup-screen`: the new source option.

## Impact

- `server/src/sentences.ts`, `server/src/session.ts`, `server/src/paragraphs.ts`, `server/src/llm/models.ts` and their tests.
- `web/src/lib/audioCapture.ts`, `web/src/lib/settings.ts`, `web/src/components/SetupScreen.tsx` and their tests.
- No protocol change, no new dependencies.
- A sentence without closing punctuation is now shown and translated up to 3 s later than before.
