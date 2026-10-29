import { detectCaptionSource } from "./captions.ts";
import { TranscriptBuffer } from "./transcript.ts";
import { CopilotWidget } from "./widget.ts";
import { segmentTurns, shouldAssist, extractTopics, questionKey } from "@interview-copilot/shared";
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
  // Phase 17/23: de-dup so Auto mode acts on each turn once.
  const answered = new Set<string>();
  let lastHandledKey: string | undefined;

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
      void analyseAndMaybeAssist(line);
    });
    // Periodically reflect caption on/off state.
    setInterval(() => widget.setCaptionsOn(source.captionsPresent()), 4000);
  }

  // Phase 23: analyse the caption stream and, in Auto mode, fire assist when the
  // local shouldAssist signal says a new turn is worth it (no server round-trip).
  async function analyseAndMaybeAssist(line: { final: boolean }): Promise<void> {
    if (!line.final) return;
    const turns = segmentTurns(buffer.recent());
    const last = turns[turns.length - 1];
    // Phase 23.5: show the analysis strip (question type + topics) for the latest turn.
    widget.setAnalysis({
      questionType: last?.classification.isQuestion ? last.classification.questionType : undefined,
      topics: extractTopics(turns.slice(-8)),
    });
    if (settings.answerMode !== "auto") return;
    const decision = shouldAssist(turns, settings.mode, lastHandledKey);
    if (!decision.assist || !decision.turn) return;
    const key = questionKey(decision.turn.text);
    if (answered.has(key)) return;
    answered.add(key);
    lastHandledKey = key;
    void autoAnswerCard(decision.turn.text.trim());
  }

  // Phase 17.2: run one auto-answer and append it as a Q→A card.
  async function autoAnswerCard(question: string): Promise<void> {
    const req = assistRequestFrom(settings, buffer.recent());
    let answer = "";
    await assistStream(
      req,
      {
        onChunk: (t) => { answer += t; },
        onError: () => { answer = answer || "[server unreachable]"; },
      },
      new AbortController().signal,
    );
    widget.pushAutoItem(question, answer.trim());
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
