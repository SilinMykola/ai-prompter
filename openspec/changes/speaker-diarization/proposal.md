# Proposal

## Why

In the live call of 2026-11-25 several people spoke (a teacher and other participants), and the call screen showed their sentences as one stream: a paragraph could mix two speakers, and the user could not tell who asked what. Deepgram's live endpoint can tell speakers apart (`diarize=true`): each recognised word then carries a speaker number. Checked on 2026-11-25 with a recorded dialogue of two different voices streamed in real time: every word of the first voice came as speaker 0 and every word of the second as speaker 1, for both `language=en` and `language=multi`, and every final result held words of one speaker only.

## What Changes

- Recognition asks for speaker numbers (`diarize=true`) and reports, with every result, the speaker of most of its words.
- A change of speaker ends the current sentence at once (also an unfinished one), so a sentence never mixes speakers.
- A change of speaker starts a new paragraph.
- The `sentence` message carries the speaker number.
- Once a call has had more than one speaker, every paragraph shows a label «Собеседник N» (N = speaker number + 1). With one speaker nothing changes on screen.
- README updated.
- Out of scope: naming speakers, telling the user's own voice apart (the system or tab audio holds the other participants only), speaker numbers in hints or translation prompts.

## Capabilities

### New Capabilities

### Modified Capabilities
- `speech-recognition`: diarization and the speaker of a result.
- `sentence-assembly`: a speaker change ends a sentence; sentences carry the speaker.
- `call-session`: speaker in `sentence`, a new paragraph on a speaker change.
- `session-protocol`: the optional `speaker` field of `sentence`.
- `call-screen`: the speaker label.

## Impact

- `server/src/stt/deepgram.ts`, `server/src/sentences.ts`, `server/src/paragraphs.ts`, `server/src/session.ts`, `shared/protocol.ts`, `web/src/lib/callReducer.ts`, `web/src/components/ParagraphCard.tsx`, `web/src/components/CallScreen.tsx`, `web/src/styles.css`, their tests; README.
- The diarizer was checked only with synthetic voices; how well it separates real participants of a noisy call is still to be seen in a real call.
