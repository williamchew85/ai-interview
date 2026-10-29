import { test, expect, describe } from "bun:test";
import {
  buildInterviewerPrompt,
  buildIntervieweePrompt,
  wasQuestionJustAsked,
  type Runner,
  type RunResult,
} from "@interview-copilot/ai";
import { createApp } from "../src/app.ts";
import type { AssistRequest, TranscriptLine } from "@interview-copilot/shared";

function fakeRunner(fn: (cmd: string[]) => Partial<RunResult>): Runner {
  return async (cmd) => {
    const r = fn(cmd);
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

const KIRO_MODELS_JSON = JSON.stringify({
  default_model: "auto",
  models: [{ model_id: "auto", model_name: "auto" }],
});

const availableRunner = (reply: string): Runner =>
  fakeRunner((cmd) => {
    if (cmd[0] === "where") return { code: 0, stdout: "x" };
    if (cmd.includes("--list-models")) return { code: 0, stdout: KIRO_MODELS_JSON };
    return { code: 0, stdout: reply };
  });

const transcript: TranscriptLine[] = [
  { id: "1", speaker: "local", speakerName: "Interviewer", text: "Tell me about a hard project.", final: true, ts: 1 },
  { id: "2", speaker: "remote", speakerName: "Candidate", text: "I rebuilt our billing pipeline to cut latency.", final: true, ts: 2 },
];

describe("Phase 4.1 interviewer prompt builder", () => {
  test("includes transcript, role context, and asks for follow-ups", () => {
    const req: AssistRequest = {
      mode: "interviewer",
      provider: "kiro",
      model: "auto",
      transcript,
      context: { jobOrRole: "Staff Engineer", focusAreas: "systems design" },
    };
    const p = buildInterviewerPrompt(req);
    expect(p).toContain("follow-up questions");
    expect(p).toContain("billing pipeline");
    expect(p).toContain("Staff Engineer");
    expect(p).toContain("systems design");
    expect(p).toContain("one per line");
  });
});

describe("Phase 5.1 interviewee prompt builder", () => {
  const qTranscript: TranscriptLine[] = [
    ...transcript,
    { id: "3", speaker: "local", speakerName: "Interviewer", text: "How did you measure the latency improvement?", final: true, ts: 3 },
  ];
  test("targets the latest question and injects background + STAR", () => {
    const req: AssistRequest = {
      mode: "interviewee",
      provider: "kiro",
      model: "auto",
      transcript: qTranscript,
      context: { background: "8 years backend, payments" },
    };
    const p = buildIntervieweePrompt(req);
    expect(p).toContain("measure the latency improvement");
    expect(p).toContain("STAR");
    expect(p).toContain("8 years backend");
  });
});

describe("Phase 5.3 question-asked heuristic", () => {
  test("detects a trailing question mark", () => {
    expect(
      wasQuestionJustAsked([{ id: "a", speaker: "local", text: "What is your biggest weakness?", final: true, ts: 1 }]),
    ).toBe(true);
  });
  test("detects an interrogative opener without punctuation", () => {
    expect(
      wasQuestionJustAsked([{ id: "a", speaker: "local", text: "tell me about a time you failed", final: true, ts: 1 }]),
    ).toBe(true);
  });
  test("non-question returns false", () => {
    expect(
      wasQuestionJustAsked([{ id: "a", speaker: "local", text: "That makes sense, thanks.", final: true, ts: 1 }]),
    ).toBe(false);
  });
});

describe("POST /api/assist interviewee mode", () => {
  test("uses the provider reply when available", async () => {
    const app = createApp({ runner: availableRunner("Use STAR: situation...") });
    const req: AssistRequest = {
      mode: "interviewee",
      provider: "kiro",
      model: "auto",
      transcript,
    };
    const res = await app.fetch(new Request("http://x/api/assist", { method: "POST", body: JSON.stringify(req) }));
    const sug = (await res.json()) as { fallback: boolean; text: string; mode: string };
    expect(sug.mode).toBe("interviewee");
    expect(sug.fallback).toBe(false);
    expect(sug.text).toContain("STAR");
  });

  test("empty CLI reply degrades to fallback", async () => {
    const app = createApp({ runner: availableRunner("   ") });
    const req: AssistRequest = { mode: "interviewer", provider: "kiro", model: "auto", transcript };
    const res = await app.fetch(new Request("http://x/api/assist", { method: "POST", body: JSON.stringify(req) }));
    const sug = (await res.json()) as { fallback: boolean };
    expect(sug.fallback).toBe(true);
  });
});

describe("POST /api/assist/stream (D1 SSE)", () => {
  async function readSse(res: Response): Promise<string> {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let out = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      out += dec.decode(value);
    }
    return out;
  }

  test("streams meta + chunk + done events", async () => {
    const app = createApp({ runner: availableRunner("Q1\nQ2\nQ3") });
    const req: AssistRequest = { mode: "interviewer", provider: "kiro", model: "auto", transcript };
    const res = await app.fetch(new Request("http://x/api/assist/stream", { method: "POST", body: JSON.stringify(req) }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const sse = await readSse(res);
    expect(sse).toContain("event: meta");
    expect(sse).toContain("\"fallback\":false");
    expect(sse).toContain("event: chunk");
    expect(sse).toContain("Q1");
    expect(sse).toContain("event: done");
  });

  test("stream marks fallback when provider unavailable", async () => {
    const noCli: Runner = fakeRunner((cmd) => (cmd[0] === "where" ? { code: 1 } : {}));
    const app = createApp({ runner: noCli });
    const req: AssistRequest = { mode: "interviewee", provider: "kiro", model: "auto", transcript };
    const res = await app.fetch(new Request("http://x/api/assist/stream", { method: "POST", body: JSON.stringify(req) }));
    const sse = await readSse(res);
    expect(sse).toContain("\"fallback\":true");
    expect(sse).toContain("event: done");
  });
});

describe("POST /api/question-asked", () => {
  test("returns asked:true for a question", async () => {
    const app = createApp({ runner: availableRunner("x") });
    const req = { mode: "interviewee", provider: "kiro", model: "auto", transcript: [{ id: "a", speaker: "local", text: "Why this role?", final: true, ts: 1 }] };
    const res = await app.fetch(new Request("http://x/api/question-asked", { method: "POST", body: JSON.stringify(req) }));
    const body = (await res.json()) as { asked: boolean };
    expect(body.asked).toBe(true);
  });
});
