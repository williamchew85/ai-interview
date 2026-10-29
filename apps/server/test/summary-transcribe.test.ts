import { test, expect, describe } from "bun:test";
import { buildSummaryPrompt, type Runner, type RunResult } from "@interview-copilot/ai";
import type { WhisperRunner, WhisperRunResult } from "@interview-copilot/stt";
import { createApp } from "../src/app.ts";
import type { TranscriptLine } from "@interview-copilot/shared";

function fakeRunner(fn: (cmd: string[]) => Partial<RunResult>): Runner {
  return async (cmd) => {
    const r = fn(cmd);
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}
function fakeWhisper(fn: (cmd: string[]) => Partial<WhisperRunResult>): WhisperRunner {
  return async (cmd) => {
    const r = fn(cmd);
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

const transcript: TranscriptLine[] = [
  { id: "1", speaker: "remote", text: "How did you handle on-call?", final: true, ts: 1 },
  { id: "2", speaker: "local", text: "We rotated weekly and cut pages 40%.", final: true, ts: 2 },
];

describe("buildSummaryPrompt (Phase 10.1)", () => {
  test("interviewer lens asks about answer quality", () => {
    const p = buildSummaryPrompt({ mode: "interviewer", transcript });
    expect(p).toContain("INTERVIEWER");
    expect(p).toContain("How did you handle on-call?");
  });
  test("candidate lens frames it from the candidate's side", () => {
    const p = buildSummaryPrompt({ mode: "interviewee", transcript });
    expect(p).toContain("CANDIDATE");
  });
});

describe("POST /api/summary (Phase 10.1)", () => {
  const avail: Runner = fakeRunner((cmd) => {
    if (cmd[0] === "where") return { code: 0, stdout: "x" };
    if (cmd.includes("--list-models")) return { code: 0, stdout: JSON.stringify({ default_model: "auto", models: [{ model_id: "auto" }] }) };
    return { code: 0, stdout: "## Summary\n- Strong on-call answer." };
  });
  test("returns the provider summary when available", async () => {
    const app = createApp({ runner: avail });
    const res = await app.fetch(new Request("http://x/api/summary", { method: "POST", body: JSON.stringify({ mode: "interviewee", transcript }) }));
    const j = (await res.json()) as { summary: string; fallback: boolean };
    expect(j.fallback).toBe(false);
    expect(j.summary).toContain("on-call");
  });
  test("bad mode -> 400", async () => {
    const app = createApp({ runner: avail });
    const res = await app.fetch(new Request("http://x/api/summary", { method: "POST", body: JSON.stringify({ mode: "nope", transcript }) }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/transcribe (Phase 9)", () => {
  test("unavailable (no runner configured) reports available:false", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://x/api/transcribe", { method: "POST", body: JSON.stringify({ wavPath: "a.wav" }) }));
    const j = (await res.json()) as { available: boolean };
    expect(j.available).toBe(false);
  });
  test("transcribes when a whisper runner + binary resolve", async () => {
    const whisper = fakeWhisper((cmd) => {
      if (cmd[0] === "where" || cmd[0] === "sh") return { code: 0, stdout: "x" };
      return { code: 0, stdout: "Hello.\nWorld." };
    });
    const app = createApp({ whisperRunner: whisper });
    const res = await app.fetch(new Request("http://x/api/transcribe", { method: "POST", body: JSON.stringify({ wavPath: "a.wav" }) }));
    const j = (await res.json()) as { available: boolean; lines: TranscriptLine[] };
    expect(j.available).toBe(true);
    expect(j.lines.map((l) => l.text)).toEqual(["Hello.", "World."]);
  });
  test("wavPath required -> 400", async () => {
    const whisper = fakeWhisper(() => ({ code: 0, stdout: "x" }));
    const app = createApp({ whisperRunner: whisper });
    const res = await app.fetch(new Request("http://x/api/transcribe", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });
});
