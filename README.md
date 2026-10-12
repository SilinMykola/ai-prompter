# AI Prompter

Local web app: live DE/EN call transcription with Russian translation and on-demand reply hints.

It listens to the audio of a Chrome tab (for example a Google Meet call), shows what the other person says in the original language, translates each sentence into Russian, and suggests an answer when you ask for one.

> Status: work in progress. The full brief is in [SPEC.md](SPEC.md); changes are tracked with [OpenSpec](openspec/).

## Quick start

1. Install Node.js 20.12 or newer.
2. `npm install`
3. `cp .env.example .env` and fill in `DEEPGRAM_API_KEY` plus at least one of `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`.
4. `npm run dev`
5. Open <http://localhost:5175> in Chrome (the dev server port is `WEB_PORT`, default 5175).

Production mode: `npm run build && npm start` serves everything from one process on <http://127.0.0.1:8787>.

Other commands: `npm test` (Vitest), `npm run typecheck`.

## Architecture

```
Call tab (Chrome) --getDisplayMedia--> web (React) --WebSocket /ws--> server (Node)
                                                                        |-- Deepgram (speech to text)
                                                                        '-- Gemini / Claude (translation, hints)
```

| Folder    | What it is                                              |
|-----------|---------------------------------------------------------|
| `shared/` | TypeScript types shared by server and web (the protocol) |
| `server/` | Express + WebSocket server, runs through `tsx`          |
| `web/`    | Vite + React 18 UI                                      |

The server listens on `127.0.0.1` only. API keys stay on the server.

## Screenshot

_Placeholder: a screenshot will be added when the UI is finished._

## Ports

| Port | Used by                                   |
|------|-------------------------------------------|
| 8787 | Node server (`PORT`)                      |
| 5175 | Vite dev server (`WEB_PORT`), proxies `/api` and `/ws` to 8787 |

SPEC.md mentions 5173 for Vite; this project uses 5175 because 5173 is taken on the author's machine.
