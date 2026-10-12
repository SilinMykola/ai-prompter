# Proposal

## Why

AI Prompter has a full brief (SPEC.md) but no code. Every later piece (sentence assembly, Deepgram bridge, LLM providers, React UI) needs a shared foundation: a workspace layout that runs with one command, and a single typed contract for the browser-server WebSocket so both sides cannot drift apart. Doing this first lets later changes be built test-first against stable types.

## What Changes

- Create an npm-workspaces monorepo with `shared/`, `server/` and `web/`, TypeScript `strict: true` in all of them.
- `npm run dev` starts the server (port 8787, bound to `127.0.0.1`) and Vite (port 5175, proxying `/ws` and `/api` to the server). The Vite port is 5175 instead of the SPEC.md default 5173 because 5173 and 5180 are used by other local apps.
- `npm run build && npm start` builds the web app and serves it from the server process on 8787.
- `npm test` runs Vitest across workspaces.
- Add `.env.example` (keys empty, `WEB_PORT=5175`) and a README skeleton (five-step setup, architecture diagram, screenshot placeholder).
- Add `shared/protocol.ts` with typed client-to-server and server-to-client WebSocket messages exactly as in SPEC.md section 8, plus the `/api/config` response type from section 3.
- Out of scope (SPEC.md section 11 and later changes): STT, sentence assembly, LLM providers, translation, hints, UI screens, reconnection logic. This change ships only a placeholder server (health route) and placeholder page that prove the wiring.

## Capabilities

### New Capabilities
- `session-protocol`: the typed WebSocket message contract between browser and server, and the public `/api/config` shape.
- `dev-workflow`: how the app is installed, run in development, built, started in production and tested, including ports and local-only binding.

### Modified Capabilities

## Impact

- New files only: root `package.json`, `tsconfig.base.json`, `.env.example`, `README.md`, `shared/`, `server/`, `web/`.
- Dependencies: `typescript`, `vitest`, `tsx`, `concurrently`, `express`, `ws`, `vite`, `react`, `react-dom`, `@vitejs/plugin-react`.
- Local `.env` (already git-ignored) gains `WEB_PORT`; no secrets are committed.
