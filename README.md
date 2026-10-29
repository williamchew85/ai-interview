# Interview Copilot

An AI interview assistant that runs as a **browser-extension widget over a web meeting**
(Google Meet / Teams-web). It reads the meeting's live captions and privately assists one role:

- **Interviewer mode** — suggests deeper follow-up questions as the conversation evolves.
- **Interviewee mode** — drafts suggested answers to the questions being asked.

You pick the AI **provider** (Kiro / Claude / Cursor) and a **model**. Providers shell out to
local CLIs using your existing logins — **no cloud API keys**. If the chosen CLI is missing or
fails, a keyless deterministic suggester keeps the app working.

See `todo.md` for the full phased build plan and the design decisions (D1–D7).

## Repo layout (monorepo, Bun workspaces)

```
packages/shared   shared TypeScript types
packages/ai       provider adapters (kiro/claude/cursor) + registry + fallback
packages/stt      CaptionSource / SttProvider interfaces
apps/server       local HTTP server: GET /api/providers, POST /api/assist
apps/web          (later) web UI shared by the extension renderer
apps/extension    (later) MV3 content-script widget
```

## Status

- **Phase 0** — scaffold & tooling ✅
- **Phase 1** — provider registry, three adapters, deterministic fallback, `/api/providers` + `/api/assist` ✅
- **Phase 4** — interviewer mode (follow-up questions) ✅
- **Phase 5** — interviewee mode (answer drafts) + SSE streaming + question heuristic ✅
- **Phase 11** — MV3 extension shell: Shadow-DOM widget, drag, compact/expanded, keyboard commands ✅
- **Phase 12** — caption capture: Meet + Teams-web DOM adapters, transcript merge/de-dup ✅
- Live in-Chrome/Meet verification (11.6 / 12.5) is pending a user run on a logged-in tab.
- Phases 2, 6, 7, 14, 15 — see `todo.md`.

## Load the extension (unpacked)

```powershell
bun run --cwd apps/server start     # start the local AI server (127.0.0.1:8791)
bun x vite build --config apps/extension/vite.config.ts   # build apps/extension/dist
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → pick
`apps/extension/dist`. Open a Google Meet / Teams-web call, **turn on the meeting's live
captions**, and the Copilot widget appears (Alt+Shift+I to toggle, Alt+Shift+S to suggest).

## Develop

> On the M: drive, `bun install` may not create `node_modules/.bin` shims — invoke tools directly.

```powershell
bun install
bun test                       # run the Phase 1 test suite
node node_modules/typescript/bin/tsc -b   # typecheck all projects
bun run --cwd apps/server start           # start the local server on 127.0.0.1:8791
```

Verify the server:

```powershell
curl http://127.0.0.1:8791/api/health
curl http://127.0.0.1:8791/api/providers
```

## Non-goals (MVP)

- No account system / auth; no call recording or storage.
- No paid STT, no paid TURN relay, no paid LLM API keys.
- Web meetings only (the extension path); a standalone WebRTC call is an optional later mode.
