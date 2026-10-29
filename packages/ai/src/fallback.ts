import type {
  AssistRequest,
  Mode,
  TranscriptLine,
} from "@interview-copilot/shared";

/**
 * Keyless, deterministic suggester used when the selected CLI is unavailable
 * or errors. It never calls an LLM — it builds reasonable output from the
 * transcript with simple heuristics, so the app never hard-fails.
 */

function lastMeaningful(transcript: TranscriptLine[]): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const t = transcript[i]?.text?.trim();
    if (t) return t;
  }
  return "";
}

function keyNoun(text: string): string {
  // crude: the longest word that isn't a stopword, else the last word.
  const stop = new Set([
    "the", "and", "that", "with", "this", "from", "have", "your", "about",
    "would", "could", "there", "their", "which", "because", "really",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  if (words.length === 0) return "that";
  return words.sort((a, b) => b.length - a.length)[0] as string;
}

function interviewerQuestions(transcript: TranscriptLine[]): string {
  const last = lastMeaningful(transcript);
  const topic = last ? keyNoun(last) : "your experience";
  return [
    `Can you walk me through a specific example involving ${topic}?`,
    `What was the hardest trade-off you faced with ${topic}, and how did you decide?`,
    `If you did that again, what would you change about how you handled ${topic}?`,
  ].join("\n");
}

function intervieweeAnswer(transcript: TranscriptLine[]): string {
  const last = lastMeaningful(transcript);
  const topic = last ? keyNoun(last) : "the question";
  return [
    `Here's a structured way to answer (STAR):`,
    `- Situation: briefly set the context around ${topic}.`,
    `- Task: what you specifically owned.`,
    `- Action: the 2–3 concrete steps you took.`,
    `- Result: the measurable outcome, plus one thing you learned.`,
  ].join("\n");
}

/** Produce deterministic text for a mode + transcript. */
export function fallbackSuggest(
  mode: Mode,
  transcript: TranscriptLine[],
): string {
  return mode === "interviewer"
    ? interviewerQuestions(transcript)
    : intervieweeAnswer(transcript);
}

/** Convenience over a full AssistRequest. */
export function fallbackForRequest(req: AssistRequest): string {
  return fallbackSuggest(req.mode, req.transcript);
}
