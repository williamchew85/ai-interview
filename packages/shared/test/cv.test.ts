import { test, expect, describe } from "bun:test";
import { normaliseCvText, guessRoleTitle, CV_MAX_CHARS } from "@interview-copilot/shared";

describe("normaliseCvText (Phase 22.1)", () => {
  test("normalises bullet glyphs to '- '", () => {
    const out = normaliseCvText("• Led the migration\n‣ Cut latency\n* Shipped v2");
    expect(out).toBe("- Led the migration\n- Cut latency\n- Shipped v2");
  });
  test("collapses inner whitespace and trims lines", () => {
    expect(normaliseCvText("  Senior   Engineer  \t at  Acme ")).toBe("Senior Engineer at Acme");
  });
  test("collapses blank-line runs to one and trims edges", () => {
    expect(normaliseCvText("\n\nA\n\n\n\nB\n\n")).toBe("A\n\nB");
  });
  test("drops page-number noise lines", () => {
    const out = normaliseCvText("Experience\n1\nPage 2 of 5\n- 3 -\nSkills");
    expect(out).toBe("Experience\nSkills");
  });
  test("caps length to the budget", () => {
    const long = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n");
    const out = normaliseCvText(long);
    expect(out.length).toBeLessThanOrEqual(CV_MAX_CHARS);
  });
  test("empty input yields empty string", () => {
    expect(normaliseCvText("")).toBe("");
  });
});

describe("guessRoleTitle (Phase 22.3)", () => {
  test("returns a short title-like first line", () => {
    const cv = "Senior Backend Engineer\njane@example.com\n- did things";
    expect(guessRoleTitle(normaliseCvText(cv))).toBe("Senior Backend Engineer");
  });
  test("skips emails, urls, bullets and sentences", () => {
    const cv = "jane@example.com\nhttps://jane.dev\n- a bullet\nI build distributed systems.\nStaff Engineer";
    expect(guessRoleTitle(normaliseCvText(cv))).toBe("Staff Engineer");
  });
  test("undefined when nothing title-like in the first lines", () => {
    expect(guessRoleTitle("- only\n- bullets\n- here")).toBeUndefined();
  });
});
