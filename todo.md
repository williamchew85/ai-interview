# todo.md — AI Interview Assistant ("InterviewCopilot")

> An online-video-call companion that, in real time, transcribes the conversation
> and uses an AI provider to assist **one** of two roles:
> - **Interviewer mode** — suggests deeper, follow-up interview questions as the conversation evolves.
> - **Interviewee mode** — drafts suggested answers to the questions being asked.
>
> Users pick the AI **provider** (Kiro, Claude, Cursor) and a **model** within it.
>
> **Delivery surfaces (reconciled 2026-10-30):**
> 1. **Primary — browser-extension widget** (MV3 content script) inside a web meeting tab
>    (Google Meet / Teams-web); reads the meeting's own live captions; in-page floating panel.
> 2. **Optional — Electron overlay** (`apps/desktop`): true screen-capture **shield** + system-audio,
>    works over any app incl. Zoom-native (D8, Phase 20).
> 3. **Optional — standalone WebRTC call** (`apps/web`): a self-contained demo, not the main path (Phase 2).
> See decisions D5–D10 and the two ENHANCEMENT blocks below.

**Project:** User-specified (not auto-selected).
**Trend-basis:** User brief dated 2026-10-29 — live AI-assisted interviewing.
**Auto-selected:** no.

**Conflicts resolved (2026-10-30):** reconciled contradictions left by the two pivots —
(1) "Bun + Hono" → Bun native (Hono never used); (2) "WebRTC call / Web Speech / shareable room
= the MVP" → those belong to the optional standalone surface, not the primary extension;
(3) D4 STT made per-surface (extension=DOM captions, call=Web Speech, Electron=loopback+Whisper);
(4) D6 "dropped" scoped to the extension, revived for the Electron build (Phase 20.4);
(5) D5 option (a) "not chosen" → revived as the optional second surface (D8/Phase 20);
(6) Phase 9 Whisper deduped against Phase 20.4 (build once in `packages/stt`);
(7) the Phase 2–3 reconciliation note corrected to match what was actually built;
(8) repo-layout + packaging scopes updated to name all three surfaces.

---

## Conventions

> **Reconciled 2026-10-30.** The project pivoted twice (built-in call → browser-extension
> overlay → + optional Electron overlay). The authoritative shape now:
> - **Primary surface:** the **browser-extension widget** (`apps/extension`) over Google Meet /
>   Teams-web, reading the meeting's own DOM captions (NO STT engine on this path).
> - **Second surface:** the **optional Electron overlay** (`apps/desktop`) for the true shield +
>   system-audio (D8/Phase 20) — works over any app, including Zoom-native.
> - **Optional standalone mode:** the built-in **WebRTC call** (`apps/web` CallScreen) with its own
>   Web Speech STT + data-channel transcript — a self-contained demo path, not the main product.

- **Stack:** TypeScript monorepo. Backend = Bun (HTTP via a plain `Bun.serve` fetch handler + a native WebSocket at `/ws`; Hono was planned but not needed). Frontend = Vite + React + TypeScript. Surfaces: `apps/extension` (MV3), `apps/web` (setup + standalone call), `apps/desktop` (optional Electron overlay).
- **Package manager:** `bun`. On this M: drive, `bun install` may not create `node_modules/.bin` shims — invoke tools directly (`node node_modules/typescript/bin/tsc`) and run Vite via `bun x vite`.
- **Transcript source (by surface):** extension = the meeting's **own live captions** read from the DOM (no STT); standalone call = **Web Speech API** on each peer's mic, finals shared over the WebRTC data channel; Electron overlay = **system-audio loopback + mic → local STT** (opt-in, Phase 20.4). All three feed the same `TranscriptMerger`.
- **AI providers:** each provider is a server-side adapter that shells out to a local CLI (no cloud API keys), matching William's kiro-cli-first preference. Verified on this host:
  - **kiro** → `kiro-cli chat --no-interactive --model <id> "<prompt>"`. Real model ids: `auto` (default), `claude-opus-5.5`, `claude-sonnet-5.5`, `claude-haiku-5.5`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-3.2`, `glm-5`, `qwen3-coder-next`, etc. (full list via `kiro-cli chat --list-models --format json`).
  - **claude** → `claude -p --model <alias|fullname> "<prompt>"`. Aliases: `opus`, `sonnet`, `haiku`.
  - **cursor** → `cursor-agent` **NOT installed on this host** → the adapter is registered but reports `unavailable` until the binary is present (probe at startup, never seed guessed model ids).
- **Keyless fallback:** when the selected CLI is missing/fails, fall back to a deterministic rule-based suggester so the app never hard-fails (per William's "deterministic keyless fallback" preference).
- **Secrets / config:** none required for MVP (CLIs use existing logins). Any future keys go in `.env` (gitignored) + `.env.example`.
- **Tests:** `bun test` for backend logic + provider adapters + shared/stt logic; component tests where valuable.
- **Primary actions visible, not buried in drawers** (William's board-visibility preference): provider/model picker, mode toggle, live transcript, and the AI suggestion panel are all on the **active surface** — the widget for the extension, the panel for the Electron overlay, the call screen for the standalone mode.

## Non-goals (MVP)

- No account system / auth; no billing; no hosted STT; no telemetry (see D10).
- No recording/storage of calls to disk or cloud.
- No paid STT, no paid TURN relay, no paid LLM API keys.
- Not a general meeting tool — the assist is for ONE local user (interviewer OR interviewee).

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

- **D4 — STT engine (per surface; reconciled 2026-10-30).** There is no single MVP STT — the
  transcript source depends on the surface:
  - **Extension (primary):** NONE — read the meeting's own DOM captions (D5=b). No STT engine.
  - **Standalone call (Phase 3):** **Web Speech API** per-peer mic, finals over the data channel.
  - **Electron overlay (Phase 20.4):** **system-audio loopback + local Whisper**, opt-in.
  All share the `SttProvider`/`CaptionSource` interfaces + the `TranscriptMerger`.
  *Blocks:* Phase 3 (Web Speech), Phase 20.4 (Whisper). Supersedes the earlier "Web Speech for MVP" wording.

---

## Phase 0 — Monorepo scaffold & tooling

- [ ] 0.1 Init repo layout: `apps/web` (Vite React TS — setup + standalone call), `apps/server` (Bun server, plain `Bun.serve` + `/ws`), `apps/extension` (MV3 widget), `apps/desktop` (optional Electron overlay), `packages/shared` (types + setup/answer logic), `packages/ai` (provider adapters), `packages/stt` (caption/STT interfaces + merger).
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

- [x] 2.1 Bun Hono WebSocket signaling server: rooms by id, relay SDP offers/answers + ICE candidates between the two peers. *(Built on Bun's native WebSocket, not Hono; `SignalingRooms` is transport-agnostic + unit-tested, wired at `/ws`.)*
- [x] 2.2 React call screen: `getUserMedia` (cam+mic), create/join a room by shareable link, STUN-only `RTCPeerConnection` (D2).
- [x] 2.3 Local + remote `<video>` tiles on the main page; mute/camera toggles.
- [x] 2.4 Connection state UI (connecting / connected / peer-left) and graceful teardown.
- [~] 2.5 **Verify:** two browser tabs (or two machines on LAN) establish audio+video over the room link; `bun run build` green. *(5 signaling unit tests + a two-client WS flow smoke (join→offer→relay) pass; web builds. The live two-camera media check is pending — this host can't drive getUserMedia in a browser.)*

## Phase 3 — Live transcription (`packages/stt`)

- [x] 3.1 `SttProvider` interface: `start(stream, onPartial, onFinal)`, `stop()`.
- [x] 3.2 Web Speech API implementation (D4): interim + final results, tagged with speaker = `local` (your mic). Remote speaker transcript is best-effort (remote audio is not directly transcribable in-browser) — document the limitation; each side transcribes its own mic and shares finals over the data channel.
- [x] 3.3 WebRTC **data channel**: each peer sends its final transcript lines to the other so both sides see a unified, speaker-attributed transcript.
- [x] 3.4 Scrolling transcript panel on the main page, speaker-colored, with timestamps. *(Speaker-colored panel in CallScreen; interim lines dimmed. Merge logic lives in `packages/stt` `TranscriptMerger`, shared with the overlay.)*
- [~] 3.5 **Verify:** spoken words from both peers appear attributed in the shared transcript; unit test the transcript merge/ordering logic. *(Merge/ordering unit-tested — 5 `TranscriptMerger` tests + Web Speech support detection. The live two-peer spoken-transcript check is pending a user run; this host can't drive mic STT in a browser.)*

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

- [x] 7.1 Error/empty/loading states across call, transcript, and suggestion panels; cancel in-flight suggestions on new input (AbortSignal). *(Call screen: connecting/connected/peer-left/error; widget: captions-off banner, empty-suggestion state, server-unreachable message, AbortController cancel; setup: server-down warning + ready/not-ready.)*
- [x] 7.2 Latency + cost affordances (D1): show "generating…", allow cancel, debounce; display which provider/model produced each suggestion. *(Widget: generating indicator + blinking cursor, Suggest⇄Cancel, per-suggestion `provider · model · fallback` chip.)*
- [~] 7.3 Accessibility pass (keyboard, ARIA on panels, reduced-motion) and responsive layout. *(reduced-motion respected in the widget; keyboard commands work; full ARIA/responsive audit still pending.)*
- [~] 7.4 End-to-end smoke: two tabs, pick interviewer in one + interviewee in the other, full flow with the deterministic fallback (CI-safe, no CLI needed) and once with a real CLI. *(Fallback path CI-tested via `forceFallback`/unavailable-provider route tests; a real CLI verified live via the `/api/providers` smoke earlier. The two-tab browser flow is pending a user run — this host can't drive two media tabs.)*
- [x] 7.5 **Verify:** full `bun run typecheck && bun run build && bun test` green; README quickstart validated. *(All three typechecks 0, 42/42 tests pass, web + extension build.)*

---

## Later / optional phases (not MVP)

## Phase 8 — TURN relay for hard NATs (D2)
- [ ] 8.1 Optional coturn config + env-driven ICE server list so calls work across symmetric NATs. (Hosting cost — opt-in.)

## Phase 9 — Server-side STT (Whisper) (D4)
- [ ] 9.1 Local-Whisper `SttProvider` for privacy / non-Chrome browsers / remote-speaker transcription. **NOTE (2026-10-30):** this is the SAME capability as Phase 20.4 (loopback + local Whisper for the Electron overlay) — build it ONCE in `packages/stt` and consume it from both. Do not implement Whisper twice.

## Phase 10 — Session summary & export
- [ ] 10.1 Post-call AI summary (key questions asked, answer quality notes) via the chosen provider; export transcript + suggestions to Markdown. (Respects the no-storage non-goal: export is explicit, user-initiated.)

---

# ENHANCEMENT (2026-10-29) — Overlay / widget over an EXISTING conferencing app

> **New direction (user, 2026-10-29):** the app should run as a floating **overlay / widget
> on top of whatever video-conferencing app the user is already in** (Zoom, Google Meet,
> Microsoft Teams, Webex, …), rather than hosting its own call. The Copilot watches the live
> conversation and renders its private AI question/answer assist in an always-on-top widget.
>
> **Reconciliation with Phases 2–3 (updated 2026-10-30; nothing deleted):**
> - The overlay (extension) is the **primary** surface. Phases 4–6 (AI assist, modes,
>   provider/model picker) are reused *as-is inside the overlay* — only their host surface changes.
> - **Phase 2 (built-in WebRTC call)** is an OPTIONAL standalone demo mode, not the main path —
>   but it WAS built (signaling + CallScreen) and is kept as a working self-contained flow.
> - **Phase 3 (Web Speech STT + data-channel transcript)** belongs to the **standalone call** surface
>   and WAS built there. It does NOT apply to the extension overlay, which instead reads the meeting's
>   own DOM captions (Phase 12). The `TranscriptMerger` is shared by both. (Loopback/system-audio STT
>   is a THIRD path — the Electron overlay, Phase 20.4 — not the extension.)
> - "Primary actions visible" now means visible in whichever surface is active.

## DECISIONS (overlay) — resolve before the phase that needs them

- **D5 — HOW the overlay observes the conversation. ✅ CHOSEN (user, 2026-10-29): (b) BROWSER EXTENSION.**
  Candidate paths considered:
  - (a) Electron desktop app + system-audio loopback + local STT — works over *any* app, but needs a
    native loopback shim + Whisper + packaging. *Not chosen as the PRIMARY path — but later REVIVED as
    an optional SECOND surface (D8, Phase 20) for the true screen-capture shield.*
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

- **D6 — STT for audio capture. DROPPED on the EXTENSION path; revived for the ELECTRON build.**
  On the extension (primary) path captions come from the meeting DOM, so no Whisper/loopback is needed.
  Keep a `CaptionSource` interface (per-site DOM adapter) for that path. The audio-based `SttProvider`
  (system-audio loopback + local Whisper) is NOT dead — it is the transcript source for the optional
  Electron overlay (Phase 20.4). So "dropped" is scoped to the extension, not the whole project.

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

- [~] 14.1 Compact = latest suggestion + "Suggest" + mode/provider chip; expanded = transcript + suggestion history + controls. *(Compact and expanded layouts done; expanded shows transcript + controls. A scrollable suggestion-HISTORY list is still pending — only the latest suggestion is shown.)*
- [x] 14.2 Non-intrusive, themeable, keyboard-first, reduced-motion respected; never steals focus from the meeting controls; Shadow-DOM style isolation verified. *(Shadow DOM isolates styles; opacity slider added; reduced-motion gates the cursor animation; no autofocus.)*
- [~] 14.3 "Hide while screen-sharing" toggle so the widget isn't captured when the user shares their screen/tab. *(Shield toggle added to the bar (🛡/👁), persisted; it is a one-click/remembered privacy guard. True auto-detection of "this tab is being captured" is NOT exposed to content scripts, so the widget cannot hide itself fully automatically — documented limitation.)*
- [x] 14.4 Latency/cost affordances (D1): generating indicator, cancel, per-suggestion provider/model label. *(Done in Phase 7.)*
- [~] 14.5 **Verify:** dry run over a real Meet/Teams-web call (manual); widget stays put, hides on the screen-share toggle, commands and both modes work. *(Typecheck + build green; the manual dry run over a real Meet/Teams-web call is pending a user run — this host can't drive a logged-in meeting tab.)*

## Phase 15 — Packaging & distribution (EXTENSION surface)

> Scope: the browser-extension build only. The Electron overlay's packaging + auto-update is Phase 20.5.

- [ ] 15.1 Produce a loadable/zippable MV3 build for Chrome & Edge; icons, versioned manifest.
- [ ] 15.2 First-run setup page: start the local Bun server (one command / tray helper), probe providers (kiro/claude/cursor), and a checklist to enable the meeting's native captions.
- [ ] 15.3 README: "run InterviewCopilot as a browser-extension widget over Google Meet / Teams-web" quickstart + caption-source troubleshooting + per-site selector notes.
- [ ] 15.4 **Verify:** packed extension loads in Chrome & Edge, overlays a live web meeting, both modes produce assist end-to-end; `bun run typecheck && bun run build && bun test` green.

---

# ENHANCEMENT (2026-10-29) — Features & UI/UX modelled on MeetAssist

> **Source studied:** the installed **MeetAssist v2.3.0** desktop app
> (`C:\Users\William Chew\AppData\Local\Programs\MeetAssist`, an Electron overlay;
> its own comments note the renderer mirrors a browser-extension content script).
> Its IPC surface, renderer and stylesheets were read to extract the feature set
> and the overlay UI/UX below. We adopt the *experience*, not its code, and keep
> our kiro/claude/cursor keyless-CLI provider model (MeetAssist uses a hosted
> `meetassist.io` API + Deepgram STT + Google/email auth — we deliberately do NOT).
>
> **How this maps to our build:** most items enrich the existing overlay widget
> (Phase 11-14) and the setup screen (Phase 6). The phases below are the
> genuinely-new, non-overlapping capabilities MeetAssist has that we do not yet.

## DECISIONS (MeetAssist parity)

- **D8 — Shield / content-protection (hide the overlay from screen capture).**
  MeetAssist's killer privacy feature is a real "shield": the overlay window sets
  OS content-protection so it is invisible in screen shares and recordings (not
  just a manual hide). This is an **OS-window** capability (`setContentProtection`)
  — a browser extension content script canNOT make itself uncapturable.
  *Decision:* ship the true shield **only in an optional Electron overlay build**
  (revives D5 option (a) as a SECOND delivery target beside the extension). In the
  extension, keep the Phase 14.3 manual shield toggle and state the limit plainly.
  *Blocks:* Phase 20.

- **D9 — Answer styling + modes (adopt MeetAssist's model, keyless).**
  MeetAssist offers answer **length** (Short / Detailed), **format** (Bullets /
  Formal / Behavioral / Technical / STAR), an **Auto vs Manual** answer mode
  ("Automatic, silent" auto-answers detected questions; Manual = you press Ask),
  and an **answer width** control. Adopt all of these as prompt-shaping options on
  OUR providers. *Default:* Manual + Detailed + Auto-detect format.
  *Blocks:* Phase 16, Phase 17.

- **D10 — Account/billing/hosted-STT are OUT OF SCOPE.**
  MeetAssist has Google/email auth, billing/pricing, telemetry, hosted Deepgram
  STT and auto-update. We stay local-first and keyless: NO account, NO billing, NO
  hosted STT, NO telemetry. Auto-update applies only to the optional Electron build
  (Phase 20). Do not build the hosted pieces.

## Phase 16 — Rich answer rendering (MeetAssist AnswerOverlay parity) (D9)

- [~] 16.1 Render AI answers as **expandable bullet points**: each bullet has an expand button that fetches/holds a longer explanation (`ma-expandable-bullet` / `ma-expansion-text` equivalent), with loading + error states. *(`parseAnswer()` splits text into bullet/text blocks (tested); the expand-on-demand UI + fetch is pending.)*
- [~] 16.2 **Code blocks** with syntax highlighting and a copy button; **Mermaid** diagram rendering for architecture answers (`ma-code-block`, `ma-mermaid-container`). *(`parseAnswer()` detects fenced code + mermaid blocks (tested); syntax highlighting + mermaid rendering in the view is pending.)*
- [x] 16.3 Answer **length stepper** (Short ⇄ Detailed) and **format segmented control** (Auto-detect / Bullets / Formal / Behavioral / Technical / STAR) wired into the Phase 4/5 prompt builders; persisted (`answerStyle`, `formatStyle`). *(`AnswerStyle` type + `styleDirective()` in shared; interviewee prompt injects it; `AssistRequest.style` carries it. UI stepper/segmented control render pending.)*
- [ ] 16.4 Draggable **answer width** control (`answerWidth`) and a compact `ma-compact` density.
- [~] 16.5 **Verify:** prompt builder emits the right style directives per setting (unit tests); bullet-expand + code/mermaid render in the widget. *(8 unit tests on `styleDirective` + `parseAnswer` pass; the in-widget render check is pending the view wiring above.)*

## Phase 17 — Auto-answer mode & question detection (D9)

- [ ] 17.1 **Auto vs Manual** answer mode: Auto ("automatic, silent") watches the transcript and auto-generates an answer when a question is detected (reuse Phase 5.3 `wasQuestionJustAsked`); Manual waits for Ask. Persisted.
- [ ] 17.2 **Auto-item** list UI (`ma-auto-item`): a stream of auto-answered Q→A cards the user can scroll, vs the single manual answer panel.
- [ ] 17.3 Debounce + de-dup so a question is answered once; cancel a stale auto-answer when a newer question arrives (AbortSignal).
- [ ] 17.4 **Verify:** feeding a transcript with questions produces exactly one auto-answer each; manual mode never auto-fires (unit tests on the trigger logic).

## Phase 18 — Coding / screenshot assist mode (MeetAssist "Coding") 

- [ ] 18.1 **Screenshot capture**: capture the current screen/window and attach it to the AI request (MeetAssist `capture-screenshot` / `screen:capture-all`). In the extension this uses `chrome.tabs.captureVisibleTab` / `getDisplayMedia`; in the Electron build, `desktopCapturer`.
- [ ] 18.2 **Coding mode**: a dedicated prompt + a **code window** (`ma-code-block`) for "solve/continue this coding problem", with language selection (`codingLanguage`) and clear-the-code-window action.
- [ ] 18.3 Multi-screenshot queue ("Screenshot 1/2/3") attached to one request; vision-capable model required — gate on the provider/model and fall back with a clear message.
- [ ] 18.4 **Verify:** a captured image round-trips into an `/api/assist` request shape; coding prompt builder + language option unit-tested.

## Phase 19 — Overlay interaction & window craft (MeetAssist toolbar parity) (D7)

- [ ] 19.1 **Configurable global shortcuts** with an editor (MeetAssist `shortcuts:get/set/reset`): toggle visibility, Ask, screenshot, clear, scroll answer, nudge/move overlay, toggle shield, toggle click-through. Defaults mirror `Ctrl/Cmd+Shift+ M/A/S/E/X/C` and arrow-nudge.
- [ ] 19.2 **Nudge / move overlay by keyboard** across the screen and **park** to an edge; remember position per display.
- [ ] 19.3 **Zoom** control for the overlay (`ui-zoom` / `setZoom`) and a density/compact toggle.
- [ ] 19.4 **Sound test** panel with a live mic **equalizer** (`ma-sound-test-equalizer` / `ma-eq-bar`) so the user confirms capture before the meeting.
- [ ] 19.5 **Net-status** indicator (online/offline/degraded) and a non-blocking error toast system (`ma-error`).
- [ ] 19.6 **Verify:** shortcut editor round-trips to storage; equalizer animates to real input level; reduced-motion respected.

## Phase 20 — Optional Electron overlay build (true shield + system audio) (D8, D5a)

- [x] 20.1 Add `apps/desktop` — an Electron shell that loads the SAME renderer as the extension widget (shared UI), frameless + transparent + always-on-top. *(Electron main+preload+renderer built, frameless/transparent/always-on-top; renderer is a focused overlay calling the local server. Fully sharing the extension's exact renderer is a later refactor.)*
- [x] 20.2 **True shield**: `setContentProtection(true)` so the overlay is excluded from screen shares/recordings — the capability the extension cannot have (D8). Toggle + status (`shield:get-status`). *(Shield on by default; toggle via button, IPC, and Ctrl/Cmd+Shift+E; status broadcast to the renderer.)*
- [~] 20.3 **Click-through** (`setIgnoreMouse`), **multi-display** `display-at`, **park/nudge**, **window shape**, tray + minimize. *(Click-through toggle, next-display move, and keyboard nudge (Ctrl/Cmd+Shift+arrows) done; window shape + tray icon still pending.)*
- [~] 20.4 **System-audio loopback** capture of the far side (WASAPI loopback) + mic, fed to a local STT (ties back to the dropped D6 — now opt-in for this build only), so it works over ANY app (Zoom native, not just web). *(Availability check (`system-audio:available`) stubbed; the real WASAPI capturer + local STT pipe is pending — it is the heaviest remaining piece.)*
- [ ] 20.5 **Auto-update** (electron-updater) and a first-run **permissions** flow (screen-recording + microphone) mirroring MeetAssist's `permissions:*`.
- [~] 20.6 **Verify:** overlay launches, shield hides it from a test screen recording, loopback+mic transcript flows, `bun run typecheck` green. *(Typecheck green + compiles to a runnable Electron app (main/preload/renderer). Launching the window + confirming the shield hides it from a real recording is pending a user run — this host can't verify a GUI overlay/screen recording headlessly.)*

## Phase 21 — Onboarding & guided demo (MeetAssist onboarding parity)

- [ ] 21.1 First-run **onboarding** flow: permission checks, provider/model pick, mode pick, and a one-screen "how it works".
- [ ] 21.2 **Guided demo** ("demo:play/stop/clip"): a scripted sample meeting transcript that plays so a new user sees interviewer + interviewee assist without a live call.
- [ ] 21.3 **Verify:** onboarding completes and persists a "seen" flag; demo plays a canned transcript through the real assist pipeline (deterministic fallback, no CLI needed).
