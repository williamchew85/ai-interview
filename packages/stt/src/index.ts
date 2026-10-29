import type { TranscriptLine } from "@interview-copilot/shared";

/**
 * A CaptionSource yields transcript lines. For the browser-extension path (D5=b)
 * this is a per-site DOM adapter reading the meeting's own live captions.
 * The audio-based SttProvider (Whisper/Web Speech) is an optional future path.
 */
export interface CaptionSource {
  readonly id: string;
  start(onLine: (line: TranscriptLine) => void): void | Promise<void>;
  stop(): void | Promise<void>;
}

/** Optional audio-based source kept for a future non-captioned-site path. */
export interface SttProvider {
  readonly id: string;
  start(
    stream: unknown,
    onPartial: (line: TranscriptLine) => void,
    onFinal: (line: TranscriptLine) => void,
  ): void | Promise<void>;
  stop(): void | Promise<void>;
}

/**
 * REMOTE-SPEAKER LIMITATION (documented, Phase 3.2):
 * The Web Speech API transcribes only the local microphone stream — a browser
 * cannot transcribe the remote peer's audio directly. In the standalone call
 * mode each peer therefore transcribes ITS OWN mic (speaker="local" locally)
 * and sends its final lines over the WebRTC data channel to the other side,
 * which re-tags them speaker="remote". The TranscriptMerger below unifies both
 * streams. The overlay path (Phase 12) sidesteps this entirely by reading the
 * meeting's own captions from the DOM.
 */

export { TranscriptMerger } from "./merge.ts";
export { WebSpeechSttProvider, isSupported } from "./web-speech.ts";
export { playDemo, demoToTranscriptLine, DEMO_SCRIPT, type DemoLine } from "./demo.ts";
