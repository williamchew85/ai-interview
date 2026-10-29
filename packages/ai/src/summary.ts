import type { TranscriptLine, Mode } from "@interview-copilot/shared";
import { renderTranscript } from "./prompts.ts";

/** Phase 10.1 — request shape for a post-call AI summary. */
export interface SummaryRequest {
  mode: Mode;
  transcript: TranscriptLine[];
}

/**
 * Build the prompt for a post-call summary: the key questions asked, themes
 * covered, and (mode-aware) notes on answer quality or coverage gaps. The
 * output is prose/markdown the UI drops into the exported document.
 */
export function buildSummaryPrompt(req: SummaryRequest): string {
  const convo = renderTranscript(req.transcript, 200);
  const lens =
    req.mode === "interviewer"
      ? "From the INTERVIEWER's side: list the key questions asked, how well each was answered (strong / partial / unanswered), and 2-3 follow-ups worth revisiting."
      : "From the CANDIDATE's side: list the key questions asked, summarise how they were answered, and 2-3 points the candidate could tighten next time.";
  return [
    "You are summarising a finished interview conversation.",
    lens,
    "Be concise and specific; use short markdown bullets grouped under clear headings. Do not invent content that is not in the transcript.",
    "",
    "Transcript:",
    convo,
    "",
    "Return ONLY the markdown summary, no preamble.",
  ].join("\n");
}
