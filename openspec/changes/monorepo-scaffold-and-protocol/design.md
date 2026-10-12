# Design

## Context

Greenfield repository: only SPEC.md, the implementation plan and OpenSpec files exist. Node 24 and npm 11 are installed locally; the spec requires Node 20+. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One `npm install` and one `npm run dev` give a working skeleton on ports 8787 and 5175.
- `shared/protocol.ts` is the only place where message shapes are defined.
- Tooling is minimal and readable, because the code doubles as a React learning reference.

**Non-Goals:**
- Any real feature logic (STT, LLM, UI screens).
- A build step for `shared/`: it is consumed as TypeScript source.

## Decisions

- **npm workspaces, no extra monorepo tool.** Required by SPEC.md. Alternatives (pnpm, turborepo) add tools without benefit at this size.
- **`shared` consumed as source.** `server` runs through `tsx` and `web` through Vite, both of which compile TypeScript imports from `shared/protocol.ts` directly. `server` build uses `tsc` with a path to `shared`. Alternative (publishing `shared` as a compiled package) adds a build ordering problem for no gain.
- **Protocol as discriminated unions on `type`.** `ClientMessage` and `ServerMessage` let both sides narrow with a `switch` and get exhaustiveness checks. Alternative: separate interfaces without a union, which loses compile-time exhaustiveness.
- **Vite port from `WEB_PORT`, default 5175, `strictPort: true`.** 5173 and 5180 are taken by other local apps. `strictPort` makes Vite fail loudly instead of silently moving to another port that the user did not expect. The server port stays `PORT` (8787).
- **Vite proxy for `/api` and `/ws` (with `ws: true`).** Matches SPEC.md section 2, so the browser talks to one origin in development and production alike.
- **Dev runner: `concurrently`.** Runs `tsx watch` and `vite` side by side with prefixed output. Alternative: two terminals, which breaks "one command".
- **Vitest per workspace via a root `vitest.workspace` / projects config.** Server uses the `node` environment; web uses `jsdom` (added when the first web test appears). Root `npm test` runs all.
- **Placeholder server** exposes only `GET /api/health` on `127.0.0.1`, to prove the proxy and binding; real routes arrive in later changes.

## Risks / Trade-offs

- [Path imports from `shared` differ between `tsx`, Vite and `tsc`] → use a `paths`/relative import convention verified by a type-check script (`npm run typecheck`) in the first task.
- [Port 5175 could also be occupied on another day] → `WEB_PORT` override and `strictPort` error message.
- [Protocol drift from SPEC.md] → the spec scenarios in `session-protocol` list every message and field; a compile-time test file in `shared` pins the shapes.

## Migration Plan

None: greenfield. Rollback is reverting the commit.
