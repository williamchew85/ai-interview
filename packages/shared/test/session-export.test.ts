import { test, expect, describe } from "bun:test";
import { renderSessionMarkdown, exportFilename } from "@interview-copilot/shared";
import type { TranscriptLine, Suggestion } from "@interview-copilot/shared";

const transcript: TranscriptLine[] = [
  { id: "1", speaker: "remote", text: "Tell me about a scaling challenge.", final: true, ts: 1_700_000_000_000 },
  { id: "2", speaker: "local", text: "We sharded the write path.", final: true, ts: 1_700_000_002_000 },
  { id: "3", speaker: "local", text: "partial…", final: false, ts: 1_700_000_003_000 },
];

const suggestions: Suggestion[] = [
  { id: "s1", mode: "interviewee", text: "Use STAR: Situation… Result…", provider: "kiro", model: "auto", fallback: false, ts: 1_700_000_001_000 },
];

describe("renderSessionMarkdown (Phase 10)", () => {
  test("includes a title, transcript finals, and suggestions", () => {
    const md = renderSessionMarkdown({ title: "T", mode: "interviewee", provider: "kiro", model: "auto", transcript, suggestions });
    expect(md).toContain("# T");
    expect(md).toContain("Tell me about a scaling challenge.");
    expect(md).toContain("We sharded the write path.");
    expect(md).toContain("Use STAR");
  });
  test("omits interim (non-final) lines", () => {
    const md = renderSessionMarkdown({ transcript, suggestions });
    expect(md).not.toContain("partial…");
  });
  test("marks a fallback suggestion", () => {
    const md = renderSessionMarkdown({
      transcript,
      suggestions: [{ ...suggestions[0]!, fallback: true }],
    });
    expect(md).toContain("offline fallback");
  });
  test("includes the AI summary when provided", () => {
    const md = renderSessionMarkdown({ transcript, suggestions, summary: "Covered scaling well." });
    expect(md).toContain("## Summary");
    expect(md).toContain("Covered scaling well.");
  });
  test("handles an empty session gracefully", () => {
    const md = renderSessionMarkdown({ transcript: [], suggestions: [] });
    expect(md).toContain("_No transcript captured._");
    expect(md).toContain("_No suggestions were generated._");
  });
});

describe("exportFilename", () => {
  test("is a dated .md filename including the mode", () => {
    const f = exportFilename({ mode: "interviewer", startedAt: 1_700_000_000_000 });
    expect(f).toMatch(/^interview-copilot-interviewer-.*\.md$/);
  });
});
