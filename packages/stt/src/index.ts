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
