import type { TranscriptLine } from "@interview-copilot/shared";
import { wasQuestionJustAsked, lastLine } from "./prompts.ts";

/**
 * Phase 17 — Auto vs Manual answer mode. In Auto ("automatic, silent") mode we
 * watch the transcript and fire an answer when a NEW question is detected,
 * answering each question at most once. Manual mode never auto-fires.
 *
 * Pure + framework-free so the trigger policy is unit-testable; the widget owns
 * the actual AbortController + fetch.
 */
export type AnswerMode = "auto" | "manual";

/** Normalize a question for de-dup (ignore case, punctuation, whitespace). */
export function questionKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export class AutoAnswerTrigger {
  private answered = new Set<string>();
  private lastKey: string | undefined;

  /**
   * Given the latest transcript, return the question to auto-answer now, or
   * null. Returns null in manual mode, when the last line is not a question,
   * or when that question was already answered.
   */
  consider(mode: AnswerMode, transcript: TranscriptLine[]): string | null {
    if (mode !== "auto") return null;
    const last = lastLine(transcript);
    if (!last || !last.final) return null; // wait for a final line
    if (!wasQuestionJustAsked(transcript)) return null;
    const key = questionKey(last.text);
    if (!key || key === this.lastKey || this.answered.has(key)) return null;
    this.lastKey = key;
    this.answered.add(key);
    return last.text.trim();
  }

  /** Forget history (e.g. on meeting change or manual clear). */
  reset(): void {
    this.answered.clear();
    this.lastKey = undefined;
  }
}
