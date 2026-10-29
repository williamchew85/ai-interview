import { test, expect, describe } from "bun:test";
import {
  WhisperTranscriber,
  parseWhisperOutput,
  whisperArgv,
  type WhisperRunner,
  type WhisperRunResult,
} from "@interview-copilot/stt";

function fakeRunner(fn: (cmd: string[]) => Partial<WhisperRunResult>): WhisperRunner {
  return async (cmd) => {
    const r = fn(cmd);
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

describe("parseWhisperOutput (Phase 9)", () => {
  test("plain text: one segment per non-empty line", () => {
    const segs = parseWhisperOutput("Hello there.\n\nHow are you?\n");
    expect(segs.map((s) => s.text)).toEqual(["Hello there.", "How are you?"]);
  });
  test("strips [timestamp] markers (whisper.cpp / verbose)", () => {
    const out = "[00:00.000 --> 00:02.000]  Tell me about scaling.\n[00:02.000 --> 00:04.000]  And trade-offs.";
    expect(parseWhisperOutput(out).map((s) => s.text)).toEqual([
      "Tell me about scaling.",
      "And trade-offs.",
    ]);
  });
  test("drops bracket-only / empty lines", () => {
    expect(parseWhisperOutput("[silence]\n\n   \n").length).toBe(0);
  });
});

describe("whisperArgv", () => {
  test("defaults to the whisper binary + txt output", () => {
    expect(whisperArgv("a.wav")).toEqual(["whisper", "a.wav", "--output_format", "txt"]);
  });
  test("includes model + language when set, and a custom binary", () => {
    const argv = whisperArgv("a.wav", { binary: "whisper-cli", model: "base.en", language: "en" });
    expect(argv[0]).toBe("whisper-cli");
    expect(argv).toContain("base.en");
    expect(argv).toContain("en");
  });
});

describe("WhisperTranscriber", () => {
  test("isAvailable true when the binary resolves", async () => {
    const run = fakeRunner((cmd) => (cmd[0] === "where" || cmd[0] === "sh" ? { code: 0, stdout: "x" } : {}));
    const wh = new WhisperTranscriber(run);
    expect(await wh.isAvailable()).toBe(true);
  });
  test("isAvailable false when the probe fails", async () => {
    const wh = new WhisperTranscriber(fakeRunner(() => ({ code: 1, stdout: "" })));
    expect(await wh.isAvailable()).toBe(false);
  });
  test("transcribeFile returns final lines tagged with the speaker", async () => {
    const run = fakeRunner(() => ({ code: 0, stdout: "First line.\nSecond line." }));
    const wh = new WhisperTranscriber(run, { speaker: "remote" });
    const lines = await wh.transcribeFile("chunk.wav");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.speaker).toBe("remote");
    expect(lines[0]!.final).toBe(true);
    expect(lines.map((l) => l.text)).toEqual(["First line.", "Second line."]);
  });
  test("throws on a non-zero whisper exit", async () => {
    const wh = new WhisperTranscriber(fakeRunner(() => ({ code: 2, stderr: "boom" })));
    await expect(wh.transcribeFile("x.wav")).rejects.toThrow(/whisper exited 2/);
  });
});
