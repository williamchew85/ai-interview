import type {
  AssistRequest,
  RoleContext,
  TranscriptLine,
} from "@interview-copilot/shared";
import { styleDirective } from "@interview-copilot/shared";

/** Render the recent transcript as "Speaker: text" lines, newest last. */
export function renderTranscript(
  transcript: TranscriptLine[],
  maxLines = 30,
): string {
  const recent = transcript.slice(-maxLines);
  return recent
    .map((l) => `${l.speakerName ?? labelFor(l.speaker)}: ${l.text}`)
    .join("\n");
}

function labelFor(speaker: TranscriptLine["speaker"]): string {
  if (speaker === "local") return "You";
  if (speaker === "remote") return "Them";
  return "Speaker";
}

/** The most recent non-empty transcript line. */
export function lastLine(
  transcript: TranscriptLine[],
): TranscriptLine | undefined {
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i]?.text?.trim()) return transcript[i];
  }
  return undefined;
}

/**
 * Heuristic (Phase 5.3): did the other party just ask a question?
 * Used by interviewee mode to decide when to offer an answer draft.
 */
export function wasQuestionJustAsked(transcript: TranscriptLine[]): boolean {
  const last = lastLine(transcript);
  if (!last) return false;
  const t = last.text.trim();
  if (t.endsWith("?")) return true;
  // Interrogative openers even without a '?' (captions often drop punctuation).
  return /^(what|why|how|when|where|who|which|can you|could you|would you|tell me|describe|walk me|do you|have you|are you|give me an example)\b/i.test(
    t,
  );
}

function contextBlock(ctx: RoleContext | undefined, mode: "interviewer" | "interviewee"): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (mode === "interviewer") {
    if (ctx.jobOrRole) parts.push(`Role being interviewed for: ${ctx.jobOrRole}.`);
    if (ctx.focusAreas) parts.push(`Focus areas: ${ctx.focusAreas}.`);
  } else {
    if (ctx.jobOrRole) parts.push(`Role the candidate is applying for: ${ctx.jobOrRole}.`);
    if (ctx.background) parts.push(`Candidate background: ${ctx.background}.`);
  }
  return parts.length ? `\nContext: ${parts.join(" ")}\n` : "";
}

/** Phase 4.1 — interviewer: deeper follow-up questions grounded in the answer. */
export function buildInterviewerPrompt(req: AssistRequest): string {
  const convo = renderTranscript(req.transcript);
  const ctx = contextBlock(req.context, "interviewer");
  return [
    "You are an expert interviewer's real-time assistant.",
    "Read the conversation and propose 2-3 DEEPER follow-up questions that dig into what the candidate just said — probe for specifics, trade-offs, and evidence. Avoid generic questions and anything already asked.",
    ctx,
    "Conversation:",
    convo,
    "",
    "Return ONLY the questions, one per line, no numbering or preamble.",
  ].join("\n");
}

/** Phase 5.1 — interviewee: a concise, structured answer to the latest question. */
export function buildIntervieweePrompt(req: AssistRequest): string {
  const convo = renderTranscript(req.transcript);
  const ctx = contextBlock(req.context, "interviewee");
  const last = lastLine(req.transcript);
  const target = last ? `\nThe question to answer: "${last.text.trim()}"` : "";
  const style = req.style ? `\nStyle: ${styleDirective(req.style)}` : "";
  return [
    "You are a job candidate's real-time answer assistant.",
    "Draft a concise, confident, well-structured answer to the interviewer's most recent question. For behavioral questions use STAR (Situation, Task, Action, Result). Keep it speakable in under ~45 seconds. Ground it in the candidate's background when provided; never invent specific facts that contradict it.",
    ctx,
    target,
    style,
    "",
    "Conversation:",
    convo,
    "",
    "Return ONLY the suggested answer, no preamble.",
  ].join("\n");
}

/** Dispatch by mode. */
export function buildPrompt(req: AssistRequest): string {
  return req.mode === "interviewer"
    ? buildInterviewerPrompt(req)
    : buildIntervieweePrompt(req);
}
