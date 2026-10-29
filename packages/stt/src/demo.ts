import type { TranscriptLine } from "@interview-copilot/shared";

/**
 * Phase 21.2 — a scripted sample meeting so a new user sees the assist working
 * without a live call. The demo plays these lines into the transcript buffer at
 * a readable pace; the real assist pipeline (deterministic fallback, no CLI
 * needed) then produces questions/answers off them.
 */
export interface DemoLine {
  speaker: "local" | "remote";
  speakerName: string;
  text: string;
  /** ms to wait before playing this line. */
  delayMs: number;
}

export const DEMO_SCRIPT: DemoLine[] = [
  { speaker: "local", speakerName: "Interviewer", text: "Thanks for joining. Tell me about a project you're proud of.", delayMs: 0 },
  { speaker: "remote", speakerName: "Candidate", text: "I led a rebuild of our billing pipeline that cut end-to-end latency from 900ms to 120ms.", delayMs: 2500 },
  { speaker: "local", speakerName: "Interviewer", text: "How did you measure that latency improvement?", delayMs: 3000 },
  { speaker: "remote", speakerName: "Candidate", text: "We added tracing and compared p95 before and after across a week of traffic.", delayMs: 3000 },
  { speaker: "local", speakerName: "Interviewer", text: "What was the hardest trade-off you made?", delayMs: 3000 },
];

/** Build the equivalent TranscriptLine for a demo line. */
export function demoToTranscriptLine(d: DemoLine, i: number): TranscriptLine {
  return {
    id: `demo_${i}`,
    speaker: d.speaker,
    speakerName: d.speakerName,
    text: d.text,
    final: true,
    ts: Date.now(),
  };
}

/** Play the script, invoking onLine at each line's cumulative delay. Returns a cancel fn. */
export function playDemo(
  onLine: (line: TranscriptLine) => void,
  script: DemoLine[] = DEMO_SCRIPT,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cumulative = 0;
  script.forEach((d, i) => {
    cumulative += d.delayMs;
    timers.push(setTimeout(() => onLine(demoToTranscriptLine(d, i)), cumulative));
  });
  return () => timers.forEach(clearTimeout);
}
