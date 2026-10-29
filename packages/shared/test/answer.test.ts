import { test, expect, describe } from "bun:test";
import {
  styleDirective,
  parseAnswer,
  DEFAULT_ANSWER_STYLE,
  ANSWER_FORMAT_LABELS,
} from "@interview-copilot/shared";

describe("styleDirective (Phase 16.3)", () => {
  test("short + bullets", () => {
    const d = styleDirective({ length: "short", format: "bullets" });
    expect(d).toContain("SHORT");
    expect(d).toContain("bullet");
  });
  test("detailed + STAR", () => {
    const d = styleDirective({ length: "detailed", format: "star" });
    expect(d).toContain("DETAILED");
    expect(d).toContain("STAR");
  });
  test("every format has a label and a directive", () => {
    for (const fmt of Object.keys(ANSWER_FORMAT_LABELS) as Array<keyof typeof ANSWER_FORMAT_LABELS>) {
      const d = styleDirective({ ...DEFAULT_ANSWER_STYLE, format: fmt });
      expect(d.length).toBeGreaterThan(0);
    }
  });
});

describe("parseAnswer (Phase 16.1/16.2)", () => {
  test("splits bullets into a bullets block", () => {
    const blocks = parseAnswer("Intro line\n- one\n- two\n- three");
    expect(blocks[0]).toEqual({ kind: "text", text: "Intro line" });
    expect(blocks[1]).toEqual({ kind: "bullets", items: ["one", "two", "three"] });
  });

  test("extracts a fenced code block with language", () => {
    const blocks = parseAnswer("Here:\n```ts\nconst x = 1;\n```\ndone");
    expect(blocks.find((b) => b.kind === "code")).toEqual({ kind: "code", lang: "ts", code: "const x = 1;" });
    expect(blocks.some((b) => b.kind === "text" && b.text === "done")).toBe(true);
  });

  test("recognises a mermaid block", () => {
    const blocks = parseAnswer("```mermaid\ngraph TD; A-->B;\n```");
    expect(blocks[0]).toEqual({ kind: "mermaid", code: "graph TD; A-->B;" });
  });

  test("numbered and * bullets both parse", () => {
    const blocks = parseAnswer("1. first\n2. second\n* star");
    expect(blocks[0]).toEqual({ kind: "bullets", items: ["first", "second", "star"] });
  });

  test("plain prose stays one text block", () => {
    const blocks = parseAnswer("just a sentence.");
    expect(blocks).toEqual([{ kind: "text", text: "just a sentence." }]);
  });
});
