# Tasks

## 1. Workspace scaffold

- [x] 1.1 Add root `package.json` (workspaces `shared`, `server`, `web`; scripts `dev`, `build`, `start`, `test`, `typecheck`), `tsconfig.base.json` with `strict: true`, and per-workspace `package.json`/`tsconfig.json`; verify `npm install` succeeds and `npm run typecheck` passes
- [x] 1.2 Write a failing server test that requests `GET /api/health` from the placeholder server and expects `{ ok: true }`; verify it fails because the route does not exist
- [x] 1.3 Implement the placeholder Express server bound to `127.0.0.1` on `PORT` (default 8787) with `/api/health`; verify the test passes, then change the bind address to `0.0.0.0` in a test-visible way, confirm a bind-address test fails, and restore it
- [x] 1.4 Add the placeholder React page (function component) and `vite.config.ts` with port from `WEB_PORT` (default 5175), `strictPort: true`, and `/api` + `/ws` proxy to the server; verify `npm run dev` serves the page on 5175 and `curl localhost:5175/api/health` returns `{"ok":true}`
- [x] 1.5 Add `npm run build` and `npm start` (server serves `web/dist`); verify `curl 127.0.0.1:8787/` returns the page and `/api/health` works from the same process
- [x] 1.6 Add `.env.example` (empty keys, `PORT=8787`, `WEB_PORT=5175`) and the README skeleton (five-step setup, architecture diagram, screenshot placeholder, port note); verify `git check-ignore .env` matches and no `*_API_KEY` in `.env.example` has a value
- [x] 1.7 Wire Vitest at the root so `npm test` runs all workspaces; verify the health test runs through `npm test` from the repository root

## 2. Shared protocol

- [x] 2.1 Write a failing compile-time test in `shared/protocol.test.ts` that builds one value of every `ClientMessage` and `ServerMessage` variant, narrows with an exhaustive `switch`, and builds an `ApiConfig`; verify it fails because `protocol.ts` does not exist
- [x] 2.2 Implement `shared/protocol.ts` per SPEC.md sections 3 and 8 (`Language`, `HintMode`, `ProviderId`, `ClientMessage`, `ServerMessage`, `ApiConfig`); verify the test and `npm run typecheck` pass for `shared`, `server` and `web`
- [x] 2.3 Import one protocol type from both `server` and `web` in the placeholders; verify renaming a field in `protocol.ts` makes `npm run typecheck` fail in both, then restore it
- [x] 2.4 Add explanatory comments to every protocol type and document the protocol in the README; verify each of the 4 client and 12 server message types appears in the README table

## 3. Integration check

- [ ] 3.1 Run `npm test`, `npm run typecheck`, `npm run build` and `npm start` from a clean `node_modules`; verify all exit 0 and `git status` shows no `.env` or build output untracked
- [ ] 3.2 Review the diff with the code-review skill and fix findings; verify a second pass reports nothing blocking
