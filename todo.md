# todo.md — AI Interview Assistant ("InterviewCopilot")

> An online-video-call companion that, in real time, transcribes the conversation
> and uses an AI provider to assist **one** of two roles:
> - **Interviewer mode** — suggests deeper, follow-up interview questions as the conversation evolves.
> - **Interviewee mode** — drafts suggested answers to the questions being asked.
>
> Users pick the AI **provider** (Kiro, Claude, Cursor) and a **model** within it.
>
> **Primary surface (2026-10-29):** a **browser-extension widget** (MV3 content script) that runs
> INSIDE an existing web meeting tab (Google Meet / Teams-web), reads the meeting's own live captions,
> and shows private AI assist in a floating in-page panel. See the ENHANCEMENT block (Phase 11+) and
> decisions D5–D7. The built-in WebRTC call (Phase 2) is an optional standalone mode, not the main path.

**Project:** User-specified (not auto-selected).
**Trend-basis:** User brief dated 2026-10-29 — live AI-assisted interviewing.
**Auto-selected:** no.

---

## Conventions

- **Stack:** TypeScript monorepo. Backend = Bun + Hono (HTTP + WebSocket). Frontend = Vite + React + TypeScript.
- **Package manager:** `bun`. On this M: drive, `bun install` may not create `node_modules/.bin` shims — invoke tools directly (`node node_modules/vite/bin/vite.js build`, `node node_modules/typescript/bin/tsc -b`).
- **Video call:** WebRTC peer-to-peer (two participants) with a tiny Bun WebSocket signaling server. No paid SFU/TURN for MVP (STUN only; TURN is a later phase).
- **Speech-to-text (STT):** browser-native `Web Speech API` (`SpeechRecognition`) for MVP — zero cost, no key, runs in-browser. Pluggable STT interface so a server-side STT (Whisper) can drop in later.
- **AI providers:** each provider is a server-side adapter that shells out to a local CLI (no cloud API keys), matching William's kiro-cli-first preference. Verified on this host:
  - **kiro** → `kiro-cli chat --no-interactive --model <id> "<prompt>"`. Real model ids: `auto` (default), `claude-opus-5.5`, `claude-sonnet-5.5`, `claude-haiku-5.5`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-3.2`, `glm-5`, `qwen3-coder-next`, etc. (full list via `kiro-cli chat --list-models --format json`).
  - **claude** → `claude -p --model <alias|fullname> "<prompt>"`. Aliases: `opus`, `sonnet`, `haiku`.
  - **cursor** → `cursor-agent` **NOT installed on this host** → the adapter is registered but reports `unavailable` until the binary is present (probe at startup, never seed guessed model ids).
- **Keyless fallback:** when the selected CLI is missing/fails, fall back to a deterministic rule-based suggester so the app never hard-fails (per William's "deterministic keyless fallback" preference).
- **Secrets / config:** none required for MVP (CLIs use existing logins). Any future keys go in `.env` (gitignored) + `.env.example`.
- **Tests:** `bun test` for backend logic + provider adapters; component tests where valuable.
- **Primary actions visible on the main page**, not buried in drawers (William's board-visibility preference): provider/model picker, mode toggle, live transcript, and the AI suggestion panel are all on the call screen.

## Non-goals (MVP)

- No account system / auth (MVP is a shareable room link).
- No recording/storage of calls to disk or cloud.
- No paid STT, no paid TURN relay, no paid LLM API keys.
- Not a general meeting tool — exactly two participants, one of whom runs the Copilot.

---

## DECISIONS (resolve before the phase that needs them; defaults chosen so the build can proceed)

- **D1 — Provider adapters shell out to agentic coding CLIs, which are SLOW (multi-second per call) and not built for real-time chat.**
  During a live call this means suggestions lag the conversation by seconds, and concurrent calls are expensive.
  *Default chosen:* **debounced, on-demand** suggestions — the assistant generates only when the user clicks "Suggest" or after a speaker pauses (configurable silence threshold), NOT on every transcript token. Responses stream where the CLI supports it. If you later want sub-second assist, that requires a real streaming chat API (paid key) — a direction change, not an enhancement.
  *Blocks:* Phase 4, Phase 5.

- **D2 — WebRTC NAT traversal.** P2P works on the same LAN / simple NATs with STUN only; symmetric NATs need a TURN relay (coturn, has a hosting cost).
  *Default chosen:* **STUN-only for MVP** (Google public STUN). TURN is Phase 8, opt-in.
  *Blocks:* Phase 2.

- **D3 — Who hears the AI?** The Copilot assists the *local* user only; the AI suggestions are private to the person running that mode and are never injected into the call audio/video.
  *Default chosen:* **private local overlay** — suggestions render only in the local user's side panel.
  *Blocks:* Phase 4, Phase 5.

- **D4 — STT engine.** Web Speech API is free/instant but Chrome-only and sends audio to the browser vendor; server Whisper is private but needs a model download + CPU/GPU.
  *Default chosen:* **Web Speech API for MVP** behind an `SttProvider` interface so Whisper can replace it in Phase 9.
  *Blocks:* Phase 3.

---

## Phase 0 — Monorepo scaffold & tooling

- [ ] 0.1 Init repo layout: `apps/web` (Vite React TS), `apps/server` (Bun Hono), `packages/shared` (types), `packages/ai` (provider adapters), `packages/stt` (STT interface).
- [ ] 0.2 Root `package.json` workspaces + `bun install`; `tsconfig.base.json` with project references.
- [ ] 0.3 Shared types in `packages/shared`: `Mode = 'interviewer' | 'interviewee'`, `Provider`, `ModelInfo`, `TranscriptLine`, `Suggestion`, WS message envelopes.
- [ ] 0.4 Lint/format config; root scripts: `dev`, `build`, `test`, `typecheck` (direct `node node_modules/...` invocations for M: drive).
- [ ] 0.5 `.gitignore`, `.env.example`, `README.md` (run instructions, non-goals).
- [ ] 0.6 **Verify:** `bun run typecheck` + `bun run build` both green on the empty scaffold.

## Phase 1 — Provider registry & model discovery (`packages/ai`)

- [ ] 1.1 `Provider` adapter interface: `id`, `displayName`, `isAvailable()`, `listModels()`, `generate(prompt, {model, signal})` returning a text stream or string.
- [ ] 1.2 **Kiro adapter** — `kiro-cli chat --no-interactive --model <id>`; `listModels()` parses `--list-models --format json`; `isAvailable()` probes the binary.
- [ ] 1.3 **Claude adapter** — `claude -p --model <alias>`; models = `opus|sonnet|haiku` (documented aliases); `isAvailable()` probes `claude.exe`.
- [ ] 1.4 **Cursor adapter** — `cursor-agent`; `isAvailable()` returns false when the binary is absent (true on this host today) and `listModels()` returns `[]` — NO guessed ids.
- [ ] 1.5 Registry that probes all adapters at server start and exposes `GET /api/providers` → available providers + their models (+ unavailable ones flagged with a reason).
- [ ] 1.6 **Deterministic fallback suggester** (keyless): template/rule-based question & answer generator used when the chosen CLI is unavailable or errors.
- [ ] 1.7 **Verify:** `bun test` — adapter availability probing, kiro model-list parse, fallback behavior; integration test that `GET /api/providers` returns kiro+claude available, cursor unavailable.

## Phase 2 — Video call core (WebRTC + signaling)

- [ ] 2.1 Bun Hono WebSocket signaling server: rooms by id, relay SDP offers/answers + ICE candidates between the two peers.
- [ ] 2.2 React call screen: `getUserMedia` (cam+mic), create/join a room by shareable link, STUN-only `RTCPeerConnection` (D2).
- [ ] 2.3 Local + remote `<video>` tiles on the main page; mute/camera toggles.
- [ ] 2.4 Connection state UI (connecting / connected / peer-left) and graceful teardown.
- [ ] 2.5 **Verify:** two browser tabs (or two machines on LAN) establish audio+video over the room link; `bun run build` green.

## Phase 3 — Live transcription (`packages/stt`)

- [ ] 3.1 `SttProvider` interface: `start(stream, onPartial, onFinal)`, `stop()`.
- [ ] 3.2 Web Speech API implementation (D4): interim + final results, tagged with speaker = `local` (your mic). Remote speaker transcript is best-effort (remote audio is not directly transcribable in-browser) — document the limitation; each side transcribes its own mic and shares finals over the data channel.
- [ ] 3.3 WebRTC **data channel**: each peer sends its final transcript lines to the other so both sides see a unified, speaker-attributed transcript.
- [ ] 3.4 Scrolling transcript panel on the main page, speaker-colored, with timestamps.
- [ ] 3.5 **Verify:** spoken words from both peers appear attributed in the shared transcript; unit test the transcript merge/ordering logic.

## Phase 4 — Interviewer mode (AI question assist)

- [x] 4.1 Prompt builder: given rolling transcript + role context (job title / focus areas the interviewer entered), produce a prompt asking for 2–3 *deeper* follow-up questions grounded in what the candidate just said.
- [x] 4.2 `POST /api/assist` (mode=interviewer): streams provider output; respects chosen provider/model; falls back to deterministic suggester on failure (D1, D3).
- [~] 4.3 Trigger policy (D1): manual "Suggest questions" button **and** auto-suggest after N seconds of candidate silence (configurable, default off). *(Backend ready; the button/silence timer are built in the widget — Phase 13.3.)*
- [~] 4.4 Suggestion panel on the main page: streamed questions, click-to-copy, "ask this" marks it used; private to the interviewer (D3). *(UI panel built in the widget — Phase 13.2.)*
- [x] 4.5 **Verify:** `bun test` prompt-builder snapshot + `/api/assist` streaming with a stubbed adapter; manual run produces relevant follow-ups from a sample transcript.

## Phase 5 — Interviewee mode (AI answer assist)

- [x] 5.1 Prompt builder: given the latest interviewer question + transcript + the interviewee's entered background (resume bullets / role), produce a concise, structured suggested answer (e.g. STAR for behavioral).
- [x] 5.2 `/api/assist` (mode=interviewee) reuses the streaming + fallback path from Phase 4.
- [x] 5.3 Detect "a question was just asked" heuristic to offer an answer draft; plus a manual "Draft an answer" button (D1). *(Heuristic + `/api/question-asked` done; the button is built in the widget — Phase 13.3.)*
- [~] 5.4 Answer panel on the main page: streamed draft, copy, regenerate, tone/length controls; private to the interviewee (D3). *(UI panel built in the widget — Phase 13.2.)*
- [x] 5.5 **Verify:** `bun test` prompt-builder snapshot + stubbed streaming; manual run drafts a coherent answer to a sample question.

## Phase 6 — Mode selection & provider/model picker UX

- [x] 6.1 Pre-call setup screen: choose **mode** (interviewer / interviewee), **provider** (only available ones enabled; unavailable shown disabled with reason), **model** (populated from the registry for the chosen provider).
- [x] 6.2 Persist last-used mode/provider/model in `localStorage`; expose the picker on the call screen too so it can change mid-call. *(Web screen persists via localStorage; the widget persists via `chrome.storage` — same shared `reconcile`/`canAssist` logic.)*
- [x] 6.3 Role context inputs (interviewer: job/focus; interviewee: background) captured in setup and fed to prompt builders.
- [x] 6.4 **Verify:** picker reflects live `GET /api/providers`; switching provider/model changes which adapter `/api/assist` uses (integration test). *(9 shared-logic tests for reconcile/canAssist/persistence; web typechecks + builds.)*

## Phase 7 — Polish, resilience, end-to-end

- [ ] 7.1 Error/empty/loading states across call, transcript, and suggestion panels; cancel in-flight suggestions on new input (AbortSignal).
- [ ] 7.2 Latency + cost affordances (D1): show "generating…", allow cancel, debounce; display which provider/model produced each suggestion.
- [ ] 7.3 Accessibility pass (keyboard, ARIA on panels, reduced-motion) and responsive layout.
- [ ] 7.4 End-to-end smoke: two tabs, pick interviewer in one + interviewee in the other, full flow with the deterministic fallback (CI-safe, no CLI needed) and once with a real CLI.
- [ ] 7.5 **Verify:** full `bun run typecheck && bun run build && bun test` green; README quickstart validated.

---

## Later / optional phases (not MVP)

## Phase 8 — TURN relay for hard NATs (D2)
- [ ] 8.1 Optional coturn config + env-driven ICE server list so calls work across symmetric NATs. (Hosting cost — opt-in.)

## Phase 9 — Server-side STT (Whisper) (D4)
- [ ] 9.1 Swap-in `SttProvider` backed by local Whisper for privacy / non-Chrome browsers / remote-speaker transcription.

## Phase 10 — Session summary & export
- [ ] 10.1 Post-call AI summary (key questions asked, answer quality notes) via the chosen provider; export transcript + suggestions to Markdown. (Respects the no-storage non-goal: export is explicit, user-initiated.)

---

# ENHANCEMENT (2026-10-29) — Overlay / widget over an EXISTING conferencing app

> **New direction (user, 2026-10-29):** the app should run as a floating **overlay / widget
> on top of whatever video-conferencing app the user is already in** (Zoom, Google Meet,
> Microsoft Teams, Webex, …), rather than hosting its own call. The Copilot watches the live
> conversation and renders its private AI question/answer assist in an always-on-top widget.
>
> **Reconciliation with Phases 2–3 (does NOT delete prior work):**
> - The overlay becomes the **primary** delivery surface. Phases 4–6 (AI assist, modes,
>   provider/model picker) are reused *as-is inside the overlay* — only their host surface changes.
> - **Phase 2 (built-in WebRTC call)** is DEMOTED to an optional "standalone call" mode, not the
>   main path. Do not build it before the overlay unless you specifically want the standalone flow.
> - **Phase 3 (WebRTC data-channel transcript)** no longer applies to the overlay path — there is no
>   data channel to a peer when we sit on top of a third-party app. The overlay captures audio by
>   loopback/system-audio instead (D5) and transcribes locally (D4's `SttProvider` interface is reused).
> - All "primary actions visible on the main page" guidance now means **visible in the overlay widget**.

## DECISIONS (overlay) — resolve before the phase that needs them

- **D5 — HOW the overlay observes the conversation. ✅ CHOSEN (user, 2026-10-29): (b) BROWSER EXTENSION.**
  Candidate paths considered:
  - (a) Electron desktop app + system-audio loopback + local STT — works over *any* app, but needs a
    native loopback shim + Whisper + packaging. *Not chosen.*
  - **(b) Browser extension overlay — CHOSEN.** A content script injected into web-based meeting tabs
    (Google Meet, Teams-web, optionally Zoom-web) renders an in-page floating widget and reads the
    meeting's **own live captions** from the DOM. **No audio capture, no STT engine, no Electron.**
    Trade-off: web meetings only, and selector logic is brittle against each app's DOM changes — so
    captions are read through a per-site **adapter** with resilient selectors, and the user can turn on
    the meeting's native captions as the transcript source.
  - (c) Share-a-tab web app via `getDisplayMedia` — deferred fallback.
  *Consequence:* **D6 (local Whisper) is DROPPED for this path** — the meeting supplies the text, so no
  STT is needed. The `SttProvider` interface survives only as an optional future audio path.
  *Blocks:* Phase 11, Phase 12, Phase 13.

- **D6 — ~~STT for loopback audio~~ → DROPPED (superseded by D5=b).** Captions come from the meeting DOM,
  so no Whisper/loopback. Keep a `CaptionSource` interface (per-site DOM adapter) in its place; an
  audio-based `SttProvider` is an optional later path if a non-captioned site must be supported.

- **D7 — Widget behavior (in-page, not an OS window).** The widget is an in-page overlay rendered by the
  content script, not an OS-level always-on-top window.
  *Default chosen:* **a draggable, resizable, pinned-corner floating panel injected into the meeting tab**,
  with a compact⇄expanded toggle and a keyboard shortcut (extension `commands`) to show/hide and
  "Suggest now". It lives inside the meeting page, so it is naturally on top of the meeting UI and moves
  with that tab. A "hide while screen-sharing" toggle covers the share-capture concern.
  *Blocks:* Phase 11, Phase 14.

## Phase 11 — Extension shell (MV3 content-script widget) (D5, D7)

- [x] 11.1 Add `apps/extension` — Chrome/Edge **Manifest V3**: `content_scripts` matched to Meet/Teams-web hosts, a `service_worker` background, `commands` for the show/hide + "Suggest now" shortcuts, minimal `host_permissions`.
- [x] 11.2 Content script injects a Shadow-DOM-isolated floating panel (reuse the existing React UI, built as an IIFE/content bundle via Vite) so meeting-page CSS can't bleed in. *(Built framework-free for a tiny isolated bundle; the shared React UI lands with apps/web in Phase 6.)*
- [x] 11.3 Widget chrome: drag to reposition, compact⇄expanded toggle, pin-corner, opacity, close-to-badge; position/size persisted via `chrome.storage`.
- [x] 11.4 Keyboard commands wired through the service worker → content script (show/hide, Suggest, switch mode).
- [x] 11.5 Build/load scripts: `bun run ext:dev` (Vite watch → `dist/extension`, load unpacked) and `ext:build` (zip for store/sideload). Document the M:-drive direct-invocation quirk. *(Vite resolves from the bun store — invoke via `bun x vite`, not `node_modules/vite/bin`.)*
- [~] 11.6 **Verify:** load unpacked in Chrome, open a Google Meet tab → the widget appears, is draggable/resizable, survives meeting-page styles, commands fire; `bun run typecheck` green. *(typecheck green + builds to a loadable MV3 dist; the in-Chrome/Meet check is pending — this host cannot drive a logged-in Meet tab. Needs a user run.)*

## Phase 12 — Caption capture: read the meeting's live captions (D5)

- [x] 12.1 `CaptionSource` interface: `start(onLine)`, `stop()`, emitting `{ speaker, text, final }` lines.
- [x] 12.2 **Google Meet adapter** — `MutationObserver` on the live-captions container; resilient selectors + a configurable fallback selector; speaker attribution from Meet's caption speaker labels.
- [x] 12.3 **Teams-web adapter** — same pattern against Teams's live-captions DOM; feature-detect which adapter to use from the tab host.
- [x] 12.4 Transcript buffer with de-dup + ordering (captions re-render partial→final; reuse Phase 3's merge logic, DOM-sourced). Banner in the widget if captions are OFF, prompting the user to enable the meeting's native captions.
- [~] 12.5 **Verify:** on a real/sample Meet caption stream the widget shows an attributed, de-duplicated transcript; unit test the partial→final merge; graceful "turn on captions" state. *(Merge/de-dup unit-tested (4 tests); the live Meet caption-stream check is pending a user run on a logged-in tab.)*

## Phase 13 — Wire AI assist into the widget (reuse Phases 4–6) (D1, D3)

- [x] 13.1 Service worker calls the local Bun server (`/api/assist`, `/api/providers`) via `fetch` (localhost permission); content script never calls the CLIs directly. Document that the Bun server must be running (first-run setup covers this). *(Done incidentally with Phase 11/12: `client.ts` fetches localhost; host_permissions cover 127.0.0.1.)*
- [x] 13.2 Interviewer & interviewee panels inside the widget; prompt builders consume the caption transcript from Phase 12. *(Done with Phase 11/12.)*
- [x] 13.3 Trigger policy: command/button "Suggest"; auto-on-silence optional (D1). Suggestions stay private to the local user (D3) — rendered only in the widget, never posted to the meeting chat. *(Button + Alt+Shift+S command + privacy done; auto-on-silence left optional/off.)*
- [x] 13.4 Provider/model picker (Phase 6) in the expanded view; persisted via `chrome.storage`. *(Done with Phase 11.)*
- [ ] 13.5 **Verify:** with captions flowing, the widget streams relevant follow-up questions (interviewer) and answer drafts (interviewee) from the selected provider, deterministic fallback when the server/CLI is down.

## Phase 14 — Widget UX polish (D7)

- [ ] 14.1 Compact = latest suggestion + "Suggest" + mode/provider chip; expanded = transcript + suggestion history + controls.
- [ ] 14.2 Non-intrusive, themeable, keyboard-first, reduced-motion respected; never steals focus from the meeting controls; Shadow-DOM style isolation verified.
- [ ] 14.3 "Hide while screen-sharing" toggle so the widget isn't captured when the user shares their screen/tab.
- [ ] 14.4 Latency/cost affordances (D1): generating indicator, cancel, per-suggestion provider/model label.
- [ ] 14.5 **Verify:** dry run over a real Meet/Teams-web call (manual); widget stays put, hides on the screen-share toggle, commands and both modes work.

## Phase 15 — Packaging & distribution

- [ ] 15.1 Produce a loadable/zippable MV3 build for Chrome & Edge; icons, versioned manifest.
- [ ] 15.2 First-run setup page: start the local Bun server (one command / tray helper), probe providers (kiro/claude/cursor), and a checklist to enable the meeting's native captions.
- [ ] 15.3 README: "run InterviewCopilot as a browser-extension widget over Google Meet / Teams-web" quickstart + caption-source troubleshooting + per-site selector notes.
- [ ] 15.4 **Verify:** packed extension loads in Chrome & Edge, overlays a live web meeting, both modes produce assist end-to-end; `bun run typecheck && bun run build && bun test` green.
