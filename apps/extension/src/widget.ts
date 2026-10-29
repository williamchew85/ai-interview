import type { TranscriptLine, AnswerBlock } from "@interview-copilot/shared";
import { parseAnswer } from "@interview-copilot/shared";
import type { WidgetSettings } from "./client.ts";

/**
 * Phase 11.2-11.3 + 13.2: a Shadow-DOM-isolated floating widget. No framework,
 * so meeting-page CSS cannot bleed in and the bundle stays small. Emits user
 * intents through callbacks; the content script owns state + server calls.
 */
export interface WidgetCallbacks {
  onSuggest: () => void;
  onCancel: () => void;
  onToggleMode: () => void;
  onToggleCompact: () => void;
  onSettingsChange: (patch: Partial<WidgetSettings>) => void;
  onHide: () => void;
}

const STYLE = `
:host { all: initial; }
.panel {
  position: fixed; z-index: 2147483647; top: 80px; right: 24px;
  width: 320px; max-height: 70vh; display: flex; flex-direction: column;
  font: 13px/1.45 system-ui, sans-serif; color: #e8eaed;
  background: #1f2023; border: 1px solid #3a3d42; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.45); overflow: hidden;
}
.panel.compact { width: 300px; }
.bar { display:flex; align-items:center; gap:6px; padding:8px 10px;
  background:#17181a; cursor: move; user-select:none; border-bottom:1px solid #2c2f34; }
.bar .title { font-weight:600; flex:1; }
.bar button, .controls button, .foot button {
  background:#2a2d31; color:#e8eaed; border:1px solid #3a3d42; border-radius:6px;
  padding:3px 8px; cursor:pointer; font-size:12px; }
.bar button:hover, .controls button:hover { background:#34373c; }
.chip { font-size:11px; padding:2px 7px; border-radius:999px; background:#2a2d31; border:1px solid #3a3d42; }
.controls { display:flex; gap:6px; flex-wrap:wrap; padding:8px 10px; border-bottom:1px solid #2c2f34; }
.body { padding:10px; overflow:auto; }
.suggestion { white-space:pre-wrap; background:#17181a; border:1px solid #2c2f34;
  border-radius:8px; padding:9px; min-height:38px; }
.suggestion.generating { opacity:.75; }
.meta { font-size:11px; color:#9aa0a6; margin-top:6px; display:flex; gap:8px; align-items:center; }
.transcript { margin-top:10px; max-height:160px; overflow:auto; border-top:1px solid #2c2f34; padding-top:8px; }
.line { margin:2px 0; }
.line .sp { color:#8ab4f8; font-weight:600; margin-right:4px; }
.line.local .sp { color:#81c995; }
.banner { background:#3b2f17; color:#fdd663; border:1px solid #5c4a1f; border-radius:6px; padding:7px 9px; font-size:12px; }
.auto-stream { max-height:220px; overflow:auto; margin-bottom:8px; display:flex; flex-direction:column; gap:6px; }
.auto-item { background:#17181a; border:1px solid #2c2f34; border-radius:8px; padding:8px; }
.auto-q { font-weight:600; color:#8ab4f8; margin-bottom:4px; }
.auto-a { color:#e8eaed; }
label { display:block; font-size:11px; color:#9aa0a6; margin:6px 0 2px; }
input, select, textarea { width:100%; box-sizing:border-box; background:#17181a; color:#e8eaed;
  border:1px solid #3a3d42; border-radius:6px; padding:5px; font:inherit; }
textarea { resize:vertical; min-height:36px; }
.foot { display:flex; gap:6px; padding:8px 10px; border-top:1px solid #2c2f34; }
.hidden { display:none; }
@media (prefers-reduced-motion: no-preference) { .suggestion.generating::after { content:' ▍'; animation: blink 1s steps(2) infinite; } }
@keyframes blink { 50% { opacity:0; } }
`;

export class CopilotWidget {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private settings: WidgetSettings;
  private cb: WidgetCallbacks;
  private suggestionText = "";
  private generating = false;
  private metaText = "";
  private captionsOn = false;
  private transcript: TranscriptLine[] = [];
  /** Phase 17.2: scrollable Q→A card stream for Auto mode. */
  private autoItems: Array<{ q: string; a: string }> = [];
  /** Phase 19.5: transient error toast. */
  private toast: string | undefined;

  constructor(settings: WidgetSettings, cb: WidgetCallbacks) {
    this.settings = settings;
    this.cb = cb;
    this.host = document.createElement("div");
    this.host.id = "interview-copilot-host";
    this.root = this.host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(this.host);
    this.render();
    this.makeDraggable();
  }

  private makeDraggable(): void {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    this.root.addEventListener("mousedown", (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".bar")) return;
      if (t.closest("button")) return;
      const panel = this.root.querySelector(".panel") as HTMLElement;
      dragging = true;
      sx = (e as MouseEvent).clientX; sy = (e as MouseEvent).clientY;
      const r = panel.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const panel = this.root.querySelector(".panel") as HTMLElement;
      const x = ox + (e.clientX - sx), y = oy + (e.clientY - sy);
      panel.style.left = `${x}px`; panel.style.top = `${y}px`;
      panel.style.right = "auto";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      const panel = this.root.querySelector(".panel") as HTMLElement;
      const r = panel.getBoundingClientRect();
      this.cb.onSettingsChange({ pos: { x: r.left, y: r.top } });
    });
  }

  setSettings(s: WidgetSettings): void { this.settings = s; this.render(); }
  setCaptionsOn(on: boolean): void { this.captionsOn = on; this.render(); }
  setTranscript(t: TranscriptLine[]): void { this.transcript = t; this.render(); }

  beginGenerating(): void { this.generating = true; this.suggestionText = ""; this.metaText = ""; this.render(); }
  appendChunk(text: string): void { this.suggestionText += text; this.render(); }
  setMeta(provider: string, model: string, fallback: boolean): void {
    this.metaText = `${provider} · ${model}${fallback ? " · fallback" : ""}`;
    this.render();
  }
  endGenerating(): void { this.generating = false; this.render(); }
  showVisible(v: boolean): void { this.host.style.display = v ? "" : "none"; }

  /** Phase 17.2: append a Q→A card (Auto mode) and render the stream. */
  pushAutoItem(q: string, a: string): void {
    this.autoItems.push({ q, a });
    if (this.autoItems.length > 20) this.autoItems.shift();
    this.render();
  }
  clearAutoItems(): void { this.autoItems = []; this.render(); }

  /** Phase 19.5: show a transient error toast. */
  showToast(msg: string): void {
    this.toast = msg;
    this.render();
    setTimeout(() => { this.toast = undefined; this.render(); }, 4000);
  }

  private esc(s: string): string {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  }

  /** Phase 16: render an answer as text / bullet / code / mermaid blocks. */
  private renderBlocks(text: string): string {
    const blocks: AnswerBlock[] = parseAnswer(text);
    return blocks
      .map((b) => {
        if (b.kind === "bullets") {
          return `<ul style="margin:4px 0 4px 18px;padding:0">${b.items.map((i) => `<li>${this.esc(i)}</li>`).join("")}</ul>`;
        }
        if (b.kind === "code") {
          return `<pre style="background:#0d0f12;border:1px solid #2c2f34;border-radius:6px;padding:8px;overflow:auto;margin:4px 0"><code>${this.esc(b.code)}</code></pre>`;
        }
        if (b.kind === "mermaid") {
          // Rendering a diagram needs the mermaid lib; show the source labelled until that lands.
          return `<pre style="background:#0d0f12;border:1px dashed #5c4a1f;border-radius:6px;padding:8px;overflow:auto;margin:4px 0" title="mermaid diagram source"><code>${this.esc(b.code)}</code></pre>`;
        }
        return `<div style="margin:4px 0">${this.esc(b.text)}</div>`;
      })
      .join("");
  }

  private render(): void {
    const s = this.settings;
    const compact = s.compact;
    const modeLabel = s.mode === "interviewer" ? "Interviewer" : "Interviewee";
    const suggestLabel = s.mode === "interviewer" ? "Suggest questions" : "Draft answer";
    const lines = this.transcript.slice(-20);
    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="panel ${compact ? "compact" : ""}" style="opacity:${s.opacity ?? 1}">
        <div class="bar">
          <span class="title">🎯 Interview Copilot</span>
          <span class="chip">${modeLabel}</span>
          <button data-act="shareSafe" title="${s.screenShareSafe ? "Auto-hide while screen-sharing: ON" : "Auto-hide while screen-sharing: OFF"}">${s.screenShareSafe ? "🛡" : "👁"}</button>
          <button data-act="compact" title="Compact/expanded">${compact ? "▣" : "▢"}</button>
          <button data-act="hide" title="Hide (Alt+Shift+I)">✕</button>
        </div>
        ${compact ? "" : `
        <div class="controls">
          <label>Mode</label>
          <select data-act="mode">
            <option value="interviewer" ${s.mode === "interviewer" ? "selected" : ""}>Interviewer — suggest questions</option>
            <option value="interviewee" ${s.mode === "interviewee" ? "selected" : ""}>Interviewee — draft answers</option>
          </select>
          <label>Provider</label>
          <select data-act="provider" id="provSel"></select>
          <label>Model</label>
          <select data-act="model" id="modelSel"></select>
          <label>${s.mode === "interviewer" ? "Role / focus areas" : "Role you're applying for"}</label>
          <input data-act="jobOrRole" value="${this.esc(s.jobOrRole ?? "")}" placeholder="${s.mode === "interviewer" ? "e.g. Staff Engineer" : "e.g. Senior Backend"}" />
          ${s.mode === "interviewer"
            ? `<input data-act="focusAreas" value="${this.esc(s.focusAreas ?? "")}" placeholder="focus areas, e.g. systems design" />`
            : `<label>Your background</label><textarea data-act="background" placeholder="resume bullets / experience">${this.esc(s.background ?? "")}</textarea>`}
        </div>`}
        <div class="body">
          ${this.captionsOn ? "" : `<div class="banner">Captions are off. Turn on the meeting's live captions so Copilot can read the conversation.</div>`}
          ${this.toast ? `<div class="banner" style="background:#3b1d1d;color:#f28b82;border-color:#5c2a2a">${this.esc(this.toast)}</div>` : ""}
          ${s.answerMode === "auto" && this.autoItems.length ? `
          <div class="auto-stream">
            ${this.autoItems.slice(-10).map((it) => `<div class="auto-item"><div class="auto-q">${this.esc(it.q)}</div><div class="auto-a">${this.renderBlocks(it.a)}</div></div>`).join("")}
          </div>` : ""}
          <div class="suggestion ${this.generating ? "generating" : ""}">${this.suggestionText ? this.renderBlocks(this.suggestionText) : '<span style="color:#9aa0a6">No suggestion yet — press "' + suggestLabel + '".</span>'}</div>
          <div class="meta">${this.metaText ? `<span class="chip">${this.esc(this.metaText)}</span>` : ""}${this.suggestionText ? '<button data-act="copy">Copy</button>' : ""}</div>
          ${compact ? "" : `
          <div class="transcript">
            ${lines.length ? lines.map((l) => `<div class="line ${l.speaker}"><span class="sp">${this.esc(l.speakerName ?? l.speaker)}:</span>${this.esc(l.text)}</div>`).join("") : '<span style="color:#9aa0a6">Transcript will appear here.</span>'}
          </div>`}
        </div>
        <div class="foot">
          <button data-act="suggest" style="flex:1">${this.generating ? "Cancel" : suggestLabel}</button>
          <button data-act="toggleMode">Switch mode</button>
        </div>
      </div>`;
    this.wire();
    this.populateProviderSelects();
  }

  private providers: import("@interview-copilot/shared").ProviderInfo[] = [];
  setProviders(p: import("@interview-copilot/shared").ProviderInfo[]): void {
    this.providers = p; this.render();
  }

  private populateProviderSelects(): void {
    const provSel = this.root.getElementById("provSel") as HTMLSelectElement | null;
    const modelSel = this.root.getElementById("modelSel") as HTMLSelectElement | null;
    if (!provSel || !modelSel || !this.providers.length) return;
    provSel.innerHTML = this.providers
      .map((p) => `<option value="${p.id}" ${p.id === this.settings.provider ? "selected" : ""} ${p.available ? "" : "disabled"}>${p.displayName}${p.available ? "" : " (unavailable)"}</option>`)
      .join("");
    const cur = this.providers.find((p) => p.id === this.settings.provider);
    modelSel.innerHTML = (cur?.models ?? [])
      .map((m) => `<option value="${m.id}" ${m.id === this.settings.model ? "selected" : ""}>${m.label}</option>`)
      .join("") || '<option value="">(no models)</option>';
  }

  private wire(): void {
    const q = (sel: string) => this.root.querySelector(sel) as HTMLElement | null;
    q('[data-act="compact"]')?.addEventListener("click", () => this.cb.onToggleCompact());
    q('[data-act="hide"]')?.addEventListener("click", () => this.cb.onHide());
    q('[data-act="shareSafe"]')?.addEventListener("click", () =>
      this.cb.onSettingsChange({ screenShareSafe: !this.settings.screenShareSafe }),
    );
    q('[data-act="toggleMode"]')?.addEventListener("click", () => this.cb.onToggleMode());
    q('[data-act="suggest"]')?.addEventListener("click", () =>
      this.generating ? this.cb.onCancel() : this.cb.onSuggest(),
    );
    q('[data-act="copy"]')?.addEventListener("click", () => {
      navigator.clipboard?.writeText(this.suggestionText).catch(() => {});
    });
    (q('[data-act="mode"]') as HTMLSelectElement | null)?.addEventListener("change", (e) =>
      this.cb.onSettingsChange({ mode: (e.target as HTMLSelectElement).value as WidgetSettings["mode"] }),
    );
    (q('[data-act="provider"]') as HTMLSelectElement | null)?.addEventListener("change", (e) => {
      const provider = (e.target as HTMLSelectElement).value as WidgetSettings["provider"];
      const p = this.providers.find((x) => x.id === provider);
      this.cb.onSettingsChange({ provider, model: p?.defaultModel ?? p?.models[0]?.id ?? "" });
    });
    (q('[data-act="model"]') as HTMLSelectElement | null)?.addEventListener("change", (e) =>
      this.cb.onSettingsChange({ model: (e.target as HTMLSelectElement).value }),
    );
    for (const key of ["jobOrRole", "focusAreas", "background"] as const) {
      (q(`[data-act="${key}"]`) as HTMLInputElement | null)?.addEventListener("change", (e) =>
        this.cb.onSettingsChange({ [key]: (e.target as HTMLInputElement).value } as Partial<WidgetSettings>),
      );
    }
  }

  destroy(): void { this.host.remove(); }
}
