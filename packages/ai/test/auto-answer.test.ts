import { test, expect, describe } from "bun:test";
import { AutoAnswerTrigger, questionKey } from "@interview-copilot/ai";
import type { TranscriptLine } from "@interview-copilot/shared";

function line(text: string, final = true): TranscriptLine {
  return { id: `${Math.random()}`, speaker: "remote", text, final, ts: Date.now() };
}

describe("AutoAnswerTrigger (Phase 17)", () => {
  test("manual mode never fires", () => {
    const t = new AutoAnswerTrigger();
    expect(t.consider("manual", [line("What is your biggest weakness?")])).toBeNull();
  });

  test("auto mode fires once on a new question", () => {
    const t = new AutoAnswerTrigger();
    const q = t.consider("auto", [line("What is your biggest weakness?")]);
    expect(q).toBe("What is your biggest weakness?");
  });

  test("the same question is not answered twice", () => {
    const t = new AutoAnswerTrigger();
    const tr = [line("Tell me about scaling.")];
    expect(t.consider("auto", tr)).not.toBeNull();
    // same question re-rendered -> no second fire
    expect(t.consider("auto", [...tr, line("Tell me about scaling.")])).toBeNull();
  });

  test("a non-question does not fire", () => {
    const t = new AutoAnswerTrigger();
    expect(t.consider("auto", [line("That makes sense, thanks.")])).toBeNull();
  });

  test("waits for a final line (interim does not fire)", () => {
    const t = new AutoAnswerTrigger();
    expect(t.consider("auto", [line("What is your weakness?", false)])).toBeNull();
    expect(t.consider("auto", [line("What is your weakness?", true)])).not.toBeNull();
  });

  test("a different question fires again", () => {
    const t = new AutoAnswerTrigger();
    expect(t.consider("auto", [line("Why this role?")])).not.toBeNull();
    expect(t.consider("auto", [line("Why this role?"), line("How do you handle conflict?")])).toBe(
      "How do you handle conflict?",
    );
  });

  test("questionKey normalizes case/punctuation", () => {
    expect(questionKey("Why THIS role??")).toBe(questionKey("why this role"));
  });

  test("reset clears de-dup history", () => {
    const t = new AutoAnswerTrigger();
    const tr = [line("Why this role?")];
    t.consider("auto", tr);
    t.reset();
    expect(t.consider("auto", tr)).not.toBeNull();
  });
});
