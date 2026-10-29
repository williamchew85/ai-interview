/**
 * Answer-styling options (Phase 16 / D9), modelled on MeetAssist's answer
 * length + format controls — but applied as prompt-shaping on our own providers.
 */

export type AnswerLength = "short" | "detailed";

export type AnswerFormat =
  | "auto"
  | "bullets"
  | "formal"
  | "behavioral"
  | "technical"
  | "star";

export interface AnswerStyle {
  length: AnswerLength;
  format: AnswerFormat;
  /** Panel width in px (overlay answer width control). */
  width?: number;
  /** Compact density. */
  compact?: boolean;
}

export const DEFAULT_ANSWER_STYLE: AnswerStyle = {
  length: "detailed",
  format: "auto",
  width: 320,
  compact: false,
};

/** Human labels for the UI segmented control. */
export const ANSWER_FORMAT_LABELS: Record<AnswerFormat, string> = {
  auto: "Auto-detect",
  bullets: "Bullets",
  formal: "Formal",
  behavioral: "Behavioral",
  technical: "Technical",
  star: "STAR method",
};

/** The directive line injected into the prompt for a given style. */
export function styleDirective(style: AnswerStyle): string {
  const len =
    style.length === "short"
      ? "Keep it SHORT — 1-3 sentences, speakable in under 20 seconds."
      : "Give a DETAILED answer, but still speakable in under ~45 seconds.";
  const fmt: Record<AnswerFormat, string> = {
    auto: "Choose the clearest format for the question.",
    bullets: "Answer as 3-5 concise bullet points.",
    formal: "Use a formal, professional tone in full sentences.",
    behavioral: "Treat it as a behavioral question; answer with a concrete example.",
    technical: "Give a precise technical answer with the key terms and trade-offs.",
    star: "Structure the answer as STAR: Situation, Task, Action, Result.",
  };
  return `${len} ${fmt[style.format]}`;
}
