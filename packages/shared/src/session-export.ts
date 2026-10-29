import type { TranscriptLine, Suggestion, Mode } from "./index.ts";

/**
 * Phase 10 — session summary & export. Pure, user-initiated rendering of a
 * session (transcript + the suggestions shown) to Markdown. Respects the
 * no-storage non-goal: nothing is persisted; the caller triggers an explicit
 * export (download) and the AI summary (Phase 10.1) is layered on in the server.
 */

export interface SessionExport {
  /** Human title, e.g. "Interview Copilot session". */
  title?: string;
  mode?: Mode;
  provider?: string;
  model?: string;
  /** Epoch ms the session started; defaults to now at render time. */
  startedAt?: number;
  transcript: TranscriptLine[];
  suggestions: Suggestion[];
  /** Optional AI-generated summary paragraph(s) (Phase 10.1). */
  summary?: string;
}

function speakerLabel(s: TranscriptLine["speaker"]): string {
  return s === "local" ? "You" : s === "remote" ? "Them" : "Speaker";
}

function fmtTime(ts: number): string {
  // Stable, locale-independent HH:MM:SS (UTC) so exports are reproducible.
  return new Date(ts).toISOString().slice(11, 19);
}

/** Render a session to a Markdown document string. */
export function renderSessionMarkdown(data: SessionExport): string {
  const lines: string[] = [];
  const title = data.title ?? "Interview Copilot — session";
  lines.push(`# ${title}`, "");

  const meta: string[] = [];
  if (data.mode) meta.push(`**Mode:** ${data.mode}`);
  if (data.provider) meta.push(`**Provider:** ${data.provider}${data.model ? ` (${data.model})` : ""}`);
  if (data.startedAt) meta.push(`**Started:** ${new Date(data.startedAt).toISOString()}`);
  if (meta.length) lines.push(meta.join("  •  "), "");

  if (data.summary && data.summary.trim()) {
    lines.push("## Summary", "", data.summary.trim(), "");
  }

  lines.push("## Transcript", "");
  const finals = data.transcript.filter((l) => l.final && l.text.trim());
  if (finals.length === 0) {
    lines.push("_No transcript captured._", "");
  } else {
    for (const l of finals) {
      const who = l.speakerName?.trim() || speakerLabel(l.speaker);
      lines.push(`- \`${fmtTime(l.ts)}\` **${who}:** ${l.text.trim()}`);
    }
    lines.push("");
  }

  lines.push("## Suggestions", "");
  if (data.suggestions.length === 0) {
    lines.push("_No suggestions were generated._", "");
  } else {
    for (const s of data.suggestions) {
      const tag = s.fallback ? " _(offline fallback)_" : "";
      lines.push(`### ${fmtTime(s.ts)} — ${s.mode}${tag}`, "");
      lines.push(s.text.trim(), "");
    }
  }

  lines.push("---", `_Exported ${new Date().toISOString()} • Interview Copilot • local-first, nothing stored._`);
  return lines.join("\n");
}

/** A safe, dated filename for the exported Markdown. */
export function exportFilename(data: Pick<SessionExport, "mode" | "startedAt">): string {
  const d = new Date(data.startedAt ?? Date.now());
  const stamp = d.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `interview-copilot-${data.mode ?? "session"}-${stamp}.md`;
}
