import { test, expect, describe } from "bun:test";
import {
  KiroProvider,
  ClaudeProvider,
  CursorProvider,
  ProviderRegistry,
  fallbackSuggest,
  type Runner,
  type RunResult,
} from "@interview-copilot/ai";
import { createApp } from "../src/app.ts";
import type { AssistRequest, TranscriptLine } from "@interview-copilot/shared";

/** Build a fake Runner driven by a (cmd) -> RunResult function. */
function fakeRunner(fn: (cmd: string[]) => Partial<RunResult>): Runner {
  return async (cmd) => {
    const r = fn(cmd);
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

const KIRO_MODELS_JSON = JSON.stringify({
  default_model: "auto",
  models: [
    { model_id: "auto", model_name: "auto", description: "Auto" },
    { model_id: "claude-sonnet-5.5", model_name: "claude-sonnet-5.5" },
  ],
});

describe("binary availability probing", () => {
  test("kiro available when `where` finds it", async () => {
    const run = fakeRunner((cmd) =>
      cmd[0] === "where" ? { code: 0, stdout: "C:/kiro-cli.exe" } : {},
    );
    const p = new KiroProvider(run);
    expect(await p.isAvailable()).toBe(true);
    expect(p.unavailableReason()).toBeUndefined();
  });

  test("cursor unavailable when binary missing", async () => {
    const run = fakeRunner((cmd) =>
      cmd[0] === "where" ? { code: 1, stdout: "" } : {},
    );
    const p = new CursorProvider(run);
    expect(await p.isAvailable()).toBe(false);
    expect(p.unavailableReason()).toContain("cursor-agent");
  });
});

describe("kiro model-list parse", () => {
  test("parses model ids and default from --list-models json", async () => {
    const run = fakeRunner((cmd) => {
      if (cmd[0] === "where") return { code: 0, stdout: "x" };
      if (cmd.includes("--list-models")) return { code: 0, stdout: KIRO_MODELS_JSON };
      return {};
    });
    const p = new KiroProvider(run);
    const models = await p.listModels();
    expect(models.map((m) => m.id)).toEqual(["auto", "claude-sonnet-5.5"]);
    expect(await p.defaultModel()).toBe("auto");
  });

  test("returns [] on non-zero exit (never guesses)", async () => {
    const run = fakeRunner(() => ({ code: 1, stdout: "" }));
    const p = new KiroProvider(run);
    expect(await p.listModels()).toEqual([]);
  });
});

describe("claude documented aliases", () => {
  test("offers opus/sonnet/haiku without guessing versions", async () => {
    const p = new ClaudeProvider(fakeRunner(() => ({ code: 0 })));
    const ids = (await p.listModels()).map((m) => m.id);
    expect(ids).toEqual(["opus", "sonnet", "haiku"]);
    expect(await p.defaultModel()).toBe("sonnet");
  });
});

describe("cursor never seeds guessed ids", () => {
  test("listModels is empty", async () => {
    const p = new CursorProvider(fakeRunner(() => ({ code: 0 })));
    expect(await p.listModels()).toEqual([]);
  });
});

describe("deterministic fallback", () => {
  const transcript: TranscriptLine[] = [
    { id: "1", speaker: "remote", text: "I led the migration of our billing platform.", final: true, ts: 1 },
  ];
  test("interviewer fallback yields 3 questions, deterministically", () => {
    const a = fallbackSuggest("interviewer", transcript);
    const b = fallbackSuggest("interviewer", transcript);
    expect(a).toBe(b);
    expect(a.split("\n").length).toBe(3);
  });
  test("interviewee fallback yields a STAR structure", () => {
    const a = fallbackSuggest("interviewee", transcript);
    expect(a).toContain("Situation");
    expect(a).toContain("Result");
  });
});

describe("registry.describe()", () => {
  test("kiro+claude available, cursor unavailable (host-shaped fake)", async () => {
    const run: Runner = fakeRunner((cmd) => {
      if (cmd[0] === "where") {
        const bin = cmd[1];
        if (bin === "cursor-agent") return { code: 1, stdout: "" };
        return { code: 0, stdout: `C:/${bin}.exe` };
      }
      if (cmd.includes("--list-models")) return { code: 0, stdout: KIRO_MODELS_JSON };
      return {};
    });
    const reg = new ProviderRegistry(run);
    const info = await reg.describe();
    const byId = Object.fromEntries(info.map((p) => [p.id, p]));
    expect(byId.kiro.available).toBe(true);
    expect(byId.kiro.models.length).toBe(2);
    expect(byId.claude.available).toBe(true);
    expect(byId.cursor.available).toBe(false);
    expect(byId.cursor.unavailableReason).toContain("cursor-agent");
  });
});

describe("routes", () => {
  const allAvailable: Runner = fakeRunner((cmd) => {
    if (cmd[0] === "where") return { code: 0, stdout: "x" };
    if (cmd.includes("--list-models")) return { code: 0, stdout: KIRO_MODELS_JSON };
    // generate() call: echo a canned reply
    return { code: 0, stdout: "Q1\nQ2\nQ3" };
  });

  test("GET /api/providers returns describe() output", async () => {
    const app = createApp({ runner: allAvailable });
    const res = await app.fetch(new Request("http://x/api/providers"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body.map((p) => p.id).sort()).toEqual(["claude", "cursor", "kiro"]);
  });

  test("POST /api/assist with forceFallback marks fallback=true", async () => {
    const app = createApp({ runner: allAvailable });
    const reqBody: AssistRequest = {
      mode: "interviewer",
      provider: "kiro",
      model: "auto",
      transcript: [{ id: "1", speaker: "remote", text: "Tell me about scaling.", final: true, ts: 1 }],
      forceFallback: true,
    };
    const res = await app.fetch(
      new Request("http://x/api/assist", { method: "POST", body: JSON.stringify(reqBody) }),
    );
    const sug = (await res.json()) as { fallback: boolean; mode: string };
    expect(sug.fallback).toBe(true);
    expect(sug.mode).toBe("interviewer");
  });

  test("POST /api/assist uses the provider when available", async () => {
    const app = createApp({ runner: allAvailable });
    const reqBody: AssistRequest = {
      mode: "interviewer",
      provider: "kiro",
      model: "auto",
      transcript: [{ id: "1", speaker: "remote", text: "Tell me about scaling.", final: true, ts: 1 }],
    };
    const res = await app.fetch(
      new Request("http://x/api/assist", { method: "POST", body: JSON.stringify(reqBody) }),
    );
    const sug = (await res.json()) as { fallback: boolean; text: string };
    expect(sug.fallback).toBe(false);
    expect(sug.text).toBe("Q1\nQ2\nQ3");
  });

  test("POST /api/assist falls back when the CLI errors", async () => {
    const erroring: Runner = fakeRunner((cmd) => {
      if (cmd[0] === "where") return { code: 0, stdout: "x" };
      if (cmd.includes("--list-models")) return { code: 0, stdout: KIRO_MODELS_JSON };
      return { code: 1, stderr: "boom" }; // generate fails
    });
    const app = createApp({ runner: erroring });
    const reqBody: AssistRequest = {
      mode: "interviewee",
      provider: "kiro",
      model: "auto",
      transcript: [{ id: "1", speaker: "remote", text: "Why should we hire you?", final: true, ts: 1 }],
    };
    const res = await app.fetch(
      new Request("http://x/api/assist", { method: "POST", body: JSON.stringify(reqBody) }),
    );
    const sug = (await res.json()) as { fallback: boolean };
    expect(sug.fallback).toBe(true);
  });

  test("bad mode -> 400", async () => {
    const app = createApp({ runner: allAvailable });
    const res = await app.fetch(
      new Request("http://x/api/assist", { method: "POST", body: JSON.stringify({ mode: "nope" }) }),
    );
    expect(res.status).toBe(400);
  });
});
