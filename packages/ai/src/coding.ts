/**
 * Phase 18.2 — coding-assist prompt. "Solve / continue this coding problem",
 * optionally grounded in a transcript (the interviewer read a problem aloud),
 * a pasted problem statement, and/or attached screenshots (vision models).
 */

export interface CodingRequest {
  /** Target language for the solution. */
  language: string;
  /** Pasted or transcribed problem statement. */
  problem?: string;
  /** Existing code in the code window to continue/fix. */
  code?: string;
  /** How many screenshots are attached (described to the model separately). */
  screenshots?: number;
}

export function buildCodingPrompt(req: CodingRequest): string {
  const parts: string[] = [
    `You are a coding-interview assistant. Solve the problem in ${req.language}.`,
    "Give a correct, idiomatic solution with a one-line complexity note. Return the code in a fenced ```" + req.language + " block, then at most 3 bullet points explaining the approach.",
  ];
  if (req.problem?.trim()) parts.push(`\nProblem:\n${req.problem.trim()}`);
  if (req.code?.trim()) parts.push(`\nExisting code to continue/fix:\n\`\`\`${req.language}\n${req.code.trim()}\n\`\`\``);
  if (req.screenshots && req.screenshots > 0) {
    parts.push(`\n${req.screenshots} screenshot(s) of the problem are attached; read the problem from them.`);
  }
  return parts.join("\n");
}

/** Common coding-interview languages for the picker. */
export const CODING_LANGUAGES = [
  "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust", "sql",
] as const;
