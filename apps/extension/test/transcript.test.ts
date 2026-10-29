import { test, expect, describe } from "bun:test";
import { TranscriptBuffer } from "../src/transcript.ts";

describe("TranscriptBuffer (Phase 12.4)", () => {
  test("an evolving interim line updates in place, then freezes on final", () => {
    const b = new TranscriptBuffer();
    b.push({ speaker: "remote", speakerName: "Alex", text: "I built", final: false });
    b.push({ speaker: "remote", speakerName: "Alex", text: "I built the", final: false });
    let snap = b.push({ speaker: "remote", speakerName: "Alex", text: "I built the pipeline", final: true });
    expect(snap.length).toBe(1);
    expect(snap[0]!.text).toBe("I built the pipeline");
    expect(snap[0]!.final).toBe(true);

    // A new line after a final starts a fresh entry.
    snap = b.push({ speaker: "remote", speakerName: "Alex", text: "It cut latency", final: true });
    expect(snap.length).toBe(2);
  });

  test("two speakers interleave into distinct lines", () => {
    const b = new TranscriptBuffer();
    b.push({ speaker: "local", speakerName: "Me", text: "Tell me more", final: false });
    b.push({ speaker: "remote", speakerName: "Alex", text: "Sure", final: false });
    b.push({ speaker: "local", speakerName: "Me", text: "Tell me more about scaling", final: true });
    const snap = b.push({ speaker: "remote", speakerName: "Alex", text: "Sure, we sharded", final: true });
    expect(snap.length).toBe(2);
    expect(snap.find((l) => l.speaker === "local")!.text).toBe("Tell me more about scaling");
    expect(snap.find((l) => l.speaker === "remote")!.text).toBe("Sure, we sharded");
  });

  test("duplicate consecutive final from the same speaker is dropped", () => {
    const b = new TranscriptBuffer();
    b.push({ speaker: "remote", speakerName: "Alex", text: "Hello there", final: true });
    const snap = b.push({ speaker: "remote", speakerName: "Alex", text: "Hello there", final: true });
    expect(snap.length).toBe(1);
  });

  test("empty text is ignored; recent() caps output", () => {
    const b = new TranscriptBuffer();
    expect(b.push({ speaker: "remote", text: "   ", final: true }).length).toBe(0);
    for (let i = 0; i < 50; i++) {
      b.push({ speaker: "remote", speakerName: `S${i}`, text: `line ${i}`, final: true });
    }
    expect(b.recent(10).length).toBe(10);
  });
});
