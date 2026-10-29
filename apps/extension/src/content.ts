import { detectCaptionSource } from "./captions.ts";
import { TranscriptBuffer } from "./transcript.ts";
import { CopilotWidget } from "./widget.ts";
import {
  assistRequestFrom,
  assistStream,
  fetchProviders,
  loadSettings,
  saveSettings,
  type WidgetSettings,
} from "./client.ts";

async function main(): Promise<void> {
  let settings: WidgetSettings = await loadSettings();
  const buffer = new TranscriptBuffer();
  let abort: AbortController | undefined;
  // Phase 17: de-dup so Auto mode answers each question once.
  const answered = new Set<string>();
  const qKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const widget = new CopilotWidget(settings, {
    onSuggest: () => void runSuggest(),
    onCancel: () => abort?.abort(),
    onToggleMode: () => void patch({ mode: settings.mode === "interviewer" ? "interviewee" : "interviewer" }),
    onToggleCompact: () => void patch({ compact: !settings.compact }),
    onSettingsChange: (p) => void patch(p),
    onHide: () => void patch({ visible: false }),
  });
  widget.showVisible(settings.visible);

  // Providers (best-effort; server may be down).
  fetchProviders()
    .then((p) => widget.setProviders(p))
    .catch(() => {/* banner/handled on suggest */});

  // Captions (Phase 12).
  const source = detectCaptionSource({ selfName: settings.jobOrRole });
  if (source) {
    widget.setCaptionsOn(source.captionsPresent());
    source.start((line) => {
      buffer.push(line);
      widget.setTranscript(buffer.recent());
      widget.setCaptionsOn(true);
      void maybeAutoAnswer(line);
    });
    // Periodically reflect caption on/off state.
    setInterval(() => widget.setCaptionsOn(source.captionsPresent()), 4000);
  }

  // Phase 17: in Auto mode, fire an answer when a new final question arrives.
  async function maybeAutoAnswer(line: { text: string; final: boolean }): Promise<void> {
    if (settings.answerMode !== "auto" || !line.final) return;
    const key = qKey(line.text);
    if (!key || answered.has(key)) return;
    try {
      const r = await fetch("http://127.0.0.1:8791/api/question-asked", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: settings.mode, provider: settings.provider, model: settings.model, transcript: buffer.recent() }),
      });
      const { asked } = (await r.json()) as { asked: boolean };
      if (asked) { answered.add(key); void runSuggest(); }
    } catch { /* server down; manual still works */ }
  }

  async function patch(p: Partial<WidgetSettings>): Promise<void> {
    settings = { ...settings, ...p };
    widget.setSettings(settings);
    if ("visible" in p) widget.showVisible(settings.visible);
    await saveSettings(p);
  }

  async function runSuggest(): Promise<void> {
    abort?.abort();
    abort = new AbortController();
    widget.beginGenerating();
    const req = assistRequestFrom(settings, buffer.recent());
    await assistStream(
      req,
      {
        onMeta: (m) => widget.setMeta(m.provider, m.model, m.fallback),
        onChunk: (t) => widget.appendChunk(t),
        onDone: () => widget.endGenerating(),
        onError: () => {
          widget.appendChunk("\n[Copilot server unreachable — start the local server.]");
          widget.endGenerating();
        },
      },
      abort.signal,
    );
  }

  // Phase 11.4: commands from the service worker.
  chrome.runtime?.onMessage.addListener((msg: { cmd?: string }) => {
    if (msg.cmd === "toggle-widget") void patch({ visible: !settings.visible });
    else if (msg.cmd === "suggest-now") void runSuggest();
    else if (msg.cmd === "switch-mode")
      void patch({ mode: settings.mode === "interviewer" ? "interviewee" : "interviewer" });
  });
}

void main();
