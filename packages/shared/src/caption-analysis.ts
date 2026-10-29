import type { TranscriptLine, Speaker, Mode } from "./index.ts";

/**
 * Phase 23 — caption ANALYSIS: the understanding layer over Phase 12's raw
 * caption capture. Pure + framework-free so every surface (extension overlay,
 * standalone call, Electron) reuses it and it is fully unit-testable with no
 * live meeting. No model call — this classifies/segments the existing transcript
 * so assist fires at the right moment, on the right speaker, with the right intent.
 */

export type QuestionType =
  | "behavioral"
  | "technical"
  | "situational"
  | "factual"
  | "smalltalk";

export interface LineClassification {
  isQuestion: boolean;
  /** Present when isQuestion; the best-guess intent of the question. */
  questionType?: QuestionType;
}

const INTERROGATIVE_OPENERS =
  /^(what|why|how|when|where|who|which|can you|could you|would you|will you|do you|did you|have you|has|are you|is there|tell me|describe|walk me|give me an example|explain|talk about|let's talk|what's your)\b/i;

const SMALLTALK =
  /\b(how are you|how's it going|nice to meet|good (morning|afternoon|evening)|thanks for (joining|coming)|can you hear me|is my (audio|video)|how was your (day|weekend))\b/i;

const BEHAVIORAL =
  /\b(tell me about a time|describe a situation|give me an example|a time when|how did you handle|conflict|disagreement|failure|mistake|proud of|led a team|stakeholder)\b/i;

const TECHNICAL =
  /\b(algorithm|complexity|big-?o|data structure|design (a|the|this)|architect|scale|latency|throughput|database|index|cache|concurren|thread|api|system design|implement|optimi[sz]e|time complexity|space complexity|code|function|class|refactor)\b/i;

const SITUATIONAL =
  /\b(what would you do|how would you (approach|handle|deal)|imagine|suppose|if you (were|had)|hypothetical|scenario)\b/i;

/** Normalised de-dup key for a question turn (case/punctuation-insensitive). */
export function questionKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Phase 23.1 — classify a single line: is it a question, and of what kind. */
export function classifyLine(text: string): LineClassification {
  const t = text.trim();
  if (!t) return { isQuestion: false };
  const isQuestion = t.endsWith("?") || INTERROGATIVE_OPENERS.test(t);
  if (!isQuestion) return { isQuestion: false };
  return { isQuestion: true, questionType: classifyQuestionType(t) };
}

function classifyQuestionType(t: string): QuestionType {
  if (SMALLTALK.test(t)) return "smalltalk";
  if (BEHAVIORAL.test(t)) return "behavioral";
  if (SITUATIONAL.test(t)) return "situational";
  if (TECHNICAL.test(t)) return "technical";
  return "factual";
}

/** A coherent speaker turn: consecutive same-speaker final lines merged. */
export interface Turn {
  speaker: Speaker;
  speakerName?: string;
  text: string;
  /** ts of the last line in the turn. */
  ts: number;
  classification: LineClassification;
}

/**
 * Phase 23.2 — collapse caption fragments into coherent turns. Only FINAL lines
 * are segmented (interim caption noise is ignored); consecutive lines from the
 * same speaker join into one utterance so "the question" is a single unit.
 */
export function segmentTurns(lines: TranscriptLine[]): Turn[] {
  const turns: Turn[] = [];
  for (const l of lines) {
    if (!l.final || !l.text.trim()) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.speaker === l.speaker && prev.speakerName === l.speakerName) {
      prev.text = `${prev.text} ${l.text.trim()}`.trim();
      prev.ts = l.ts;
      prev.classification = classifyLine(prev.text);
    } else {
      turns.push({
        speaker: l.speaker,
        speakerName: l.speakerName,
        text: l.text.trim(),
        ts: l.ts,
        classification: classifyLine(l.text.trim()),
      });
    }
  }
  return turns;
}

const STOPWORDS = new Set(
  ("a an the and or but if then else of to in on at for with without about as by from into over under "
    + "is are was were be been being do does did have has had can could would should will shall may might must "
    + "i you he she it we they me him her us them my your his its our their this that these those there here "
    + "so just really very much more most some any no not yes ok okay well like what how why when where who which "
    + "your you're i'm it's that's dont don't im youre tell me about give example").split(" "),
);

/**
 * Phase 23.3 — lightweight topic/keyword extraction over recent turns. Pure
 * tokeniser: stopword-filtered, frequency-ranked single words + simple bigrams.
 * No ML — a deterministic signal to avoid re-asking covered areas and to feed
 * the summary and the widget's topic chips.
 */
export function extractTopics(turns: Turn[], max = 6): string[] {
  const text = turns.map((t) => t.text).join(" ").toLowerCase();
  const words = text.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();

  const kept: string[] = [];
  for (const w of words) {
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) {
      kept.push(""); // break bigram across a dropped token
      continue;
    }
    freq.set(w, (freq.get(w) ?? 0) + 1);
    kept.push(w);
  }
  // Simple adjacent bigrams of kept content words (weighted higher).
  for (let i = 0; i < kept.length - 1; i++) {
    if (kept[i] && kept[i + 1]) {
      const bg = `${kept[i]} ${kept[i + 1]}`;
      freq.set(bg, (freq.get(bg) ?? 0) + 2);
    }
  }
  return [...freq.entries()]
    .filter(([, n]) => n >= 2 || freq.size <= max)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

export interface AssistDecision {
  assist: boolean;
  /** The turn that warrants assist (so the caller can de-dup on its key). */
  turn?: Turn;
  reason: string;
}

/**
 * Phase 23.4 — should assist fire now? A richer replacement for the inline
 * question check: fire when there is a NEW turn worth acting on, de-duped
 * against the last handled turn.
 *  - interviewee: a new question aimed at the user (not smalltalk);
 *  - interviewer: a completed CANDIDATE answer turn worth a follow-up.
 */
export function shouldAssist(
  turns: Turn[],
  mode: Mode,
  lastHandledKey?: string,
): AssistDecision {
  const last = turns[turns.length - 1];
  if (!last) return { assist: false, reason: "no turns" };
  const key = questionKey(last.text);
  if (key && key === lastHandledKey) return { assist: false, reason: "already handled this turn" };

  if (mode === "interviewee") {
    if (!last.classification.isQuestion) return { assist: false, reason: "latest turn is not a question" };
    if (last.classification.questionType === "smalltalk") return { assist: false, reason: "smalltalk, not worth a draft" };
    // A question aimed at the user usually comes from the other party.
    return { assist: true, turn: last, reason: `new ${last.classification.questionType} question` };
  }

  // interviewer: react to the candidate's completed answer (a local/remote turn
  // that is substantive and not itself a question).
  if (last.classification.isQuestion) return { assist: false, reason: "latest turn is itself a question" };
  if (last.text.split(/\s+/).length < 8) return { assist: false, reason: "answer too short to probe" };
  return { assist: true, turn: last, reason: "candidate answer worth a follow-up" };
}
