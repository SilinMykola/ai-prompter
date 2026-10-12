# Design

## Context

Greenfield module, no I/O. Input shape comes from Deepgram's `Results` messages (`transcript`, `is_final`, `speech_final`) and `UtteranceEnd`; the Deepgram bridge that feeds it is a later change. See SPEC.md section 6.2.

## Goals / Non-Goals

**Goals:**
- A small pure module that is trivial to unit test and easy to read as a learning example.
- Deterministic output for a given sequence of inputs.

**Non-Goals:**
- Language detection, sentence translation, any WebSocket types.
- German ordinal dates ("am 12. Oktober"): a dot after digits followed by a space still ends a sentence unless it sits between two digits. Accepted for v1, noted as a known limitation.

## Decisions

- **Factory function with closure state, not a class.** `createSentenceAssembler()` keeps the buffer, interim text and id counter in local variables; the project uses a functional style. Alternative: a class, rejected for consistency with the React code.
- **Result shape: `{ sentences, finalText, interimText }` from both `pushResult` and `pushUtteranceEnd`.** `finalText` is the unfinished confirmed buffer, `interimText` the latest partial text, which is exactly what the `interim` WebSocket message needs. Alternative: callbacks, rejected because return values are simpler to test.
- **Boundary scan by walking the buffer.** For each `.?!…` run: it is a boundary only when it is followed by whitespace or the end of the buffer, which already keeps `3.5` and `12.10.2026` whole because a digit follows the dot, so no separate digit rule is needed; skip it also when the whitespace-delimited token ending at the dot is a known abbreviation; accept it when followed by whitespace or the end of the buffer. A trailing abbreviation at the end of the buffer is therefore not a boundary and waits for more text or a flush. Alternative: one big regex with look-behind, rejected as hard to read and to extend.
- **Final fragments are joined with a single space.** Deepgram's finals are already punctuated; joining with a space matches how they arrive and the result is trimmed.
- **Force split inside the same scan.** Any candidate piece over 300 characters is cut at the last comma, else last space, within the first 300 characters, else hard-cut at 300. The remainder is processed again.
- **Abbreviation list as a `Set` of lowercase tokens** at module top, so adding one is a one-line change.

## Risks / Trade-offs

- [A real sentence ending in an abbreviation, e.g. "...und so weiter bzw."] → it waits for the next result or `speech_final`/`UtteranceEnd`, at worst a one-sentence delay.
- [Ordinal dates split early] → accepted; the translator receives up to 4 previous sentences as context, which limits the damage.
- [Terminator at the very end of the buffer is treated as a boundary even if more digits could follow] → follows the SPEC wording; low impact.

## Open Questions

None that change the specs or tasks.
