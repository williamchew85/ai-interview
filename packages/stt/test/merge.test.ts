import { test, expect, describe } from "bun:test";
import { TranscriptMerger, isSupported } from "@interview-copilot/stt";

describe("TranscriptMerger (Phase 3.4/3.5)", () => {
  test("local interim grows in place then freezes on final", () => {
    const m = new TranscriptMerger();
    m.push({ speaker: "local", text: "tell me", final: false });
    m.push({ speaker: "local", text: "tell me about", final: false });
    const snap = m.push({ speaker: "local", text: "tell me about scaling", final: true });
    expect(snap.length).toBe(1);
    expect(snap[0]!.text).toBe("tell me about scaling");
    expect(snap[0]!.final).toBe(true);
  });

  test("local + remote (data-channel) finals interleave as two lines", () => {
    const m = new TranscriptMerger();
    m.push({ speaker: "local", text: "How did you scale it?", final: true });
    const snap = m.push({ speaker: "remote", text: "We sharded by tenant.", final: true });
    expect(snap.length).toBe(2);
    expect(snap[0]!.speaker).toBe("local");
    expect(snap[1]!.speaker).toBe("remote");
  });

  test("duplicate consecutive final from same speaker is dropped", () => {
    const m = new TranscriptMerger();
    m.push({ speaker: "remote", text: "hi", final: true });
    expect(m.push({ speaker: "remote", text: "hi", final: true }).length).toBe(1);
  });

  test("recent caps and clear empties", () => {
    const m = new TranscriptMerger();
    for (let i = 0; i < 60; i++) m.push({ speaker: "local", text: `l${i}`, final: true });
    expect(m.recent(5).length).toBe(5);
    m.clear();
    expect(m.snapshot().length).toBe(0);
  });
});

describe("Web Speech support detection", () => {
  test("isSupported is false under bun (no SpeechRecognition global)", () => {
    expect(isSupported()).toBe(false);
  });
});
