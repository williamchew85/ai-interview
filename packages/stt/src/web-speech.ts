import type { TranscriptLine } from "@interview-copilot/shared";
import type { SttProvider } from "./index.ts";

/**
 * Phase 3.2 — Web Speech API STT. Transcribes the LOCAL microphone only
 * (the browser cannot transcribe arbitrary remote audio), so lines are tagged
 * speaker="local". In the standalone call mode (Phase 2) each peer runs this on
 * its own mic and shares finals over the WebRTC data channel (Phase 3.3), so
 * both sides see a unified transcript.
 *
 * Chrome/Edge expose `webkitSpeechRecognition`. `isSupported()` lets callers
 * fall back gracefully on unsupported browsers.
 */

// Minimal typing of the non-standard SpeechRecognition API.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

function getCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = globalThis as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isSupported(): boolean {
  return getCtor() !== undefined;
}

export class WebSpeechSttProvider implements SttProvider {
  readonly id = "web-speech";
  private rec: SpeechRecognitionLike | undefined;
  private running = false;

  constructor(private opts: { lang?: string } = {}) {}

  start(
    _stream: unknown,
    onPartial: (line: TranscriptLine) => void,
    onFinal: (line: TranscriptLine) => void,
  ): void {
    const Ctor = getCtor();
    if (!Ctor) throw new Error("Web Speech API not supported in this browser");
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = this.opts.lang ?? "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]!;
        const text = r[0].transcript;
        const line: TranscriptLine = {
          id: `ws_${Date.now()}_${i}`,
          speaker: "local",
          text,
          final: r.isFinal,
          ts: Date.now(),
        };
        (r.isFinal ? onFinal : onPartial)(line);
      }
    };
    // Auto-restart on silence-driven end while we're meant to be running.
    rec.onend = () => {
      if (this.running) {
        try { rec.start(); } catch { /* already starting */ }
      }
    };
    this.running = true;
    rec.start();
  }

  stop(): void {
    this.running = false;
    this.rec?.stop();
    this.rec = undefined;
  }
}
