import { test, expect, describe } from "bun:test";
import { DEMO_SCRIPT, demoToTranscriptLine, playDemo } from "@interview-copilot/stt";

describe("demo script (Phase 21.2)", () => {
  test("script has interviewer + candidate turns ending on a question", () => {
    expect(DEMO_SCRIPT.length).toBeGreaterThanOrEqual(4);
    expect(DEMO_SCRIPT.some((l) => l.speaker === "local")).toBe(true);
    expect(DEMO_SCRIPT.some((l) => l.speaker === "remote")).toBe(true);
    expect(DEMO_SCRIPT[DEMO_SCRIPT.length - 1]!.text).toContain("?");
  });

  test("demoToTranscriptLine produces a final line with the speaker name", () => {
    const l = demoToTranscriptLine(DEMO_SCRIPT[0]!, 0);
    expect(l.final).toBe(true);
    expect(l.speakerName).toBe("Interviewer");
  });

  test("playDemo emits all lines over fake timers", async () => {
    const got: string[] = [];
    const script = [
      { speaker: "local" as const, speakerName: "I", text: "hi", delayMs: 1 },
      { speaker: "remote" as const, speakerName: "C", text: "hello?", delayMs: 1 },
    ];
    playDemo((l) => got.push(l.text), script);
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toEqual(["hi", "hello?"]);
  });

  test("playDemo cancel stops pending lines", async () => {
    const got: string[] = [];
    const cancel = playDemo((l) => got.push(l.text), [
      { speaker: "local", speakerName: "I", text: "late", delayMs: 50 },
    ]);
    cancel();
    await new Promise((r) => setTimeout(r, 80));
    expect(got).toEqual([]);
  });
});
