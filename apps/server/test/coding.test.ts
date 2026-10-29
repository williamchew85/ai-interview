import { test, expect, describe } from "bun:test";
import { buildCodingPrompt, CODING_LANGUAGES, type Runner, type RunResult } from "@interview-copilot/ai";
import { createApp } from "../src/app.ts";

function fakeRunner(fn: (cmd: string[]) => Partial<RunResult>): Runner {
  return async (cmd) => {
    const r = fn(cmd);
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

describe("buildCodingPrompt (Phase 18.2)", () => {
  test("names the language and asks for a fenced block", () => {
    const p = buildCodingPrompt({ language: "python", problem: "Two sum" });
    expect(p).toContain("python");
    expect(p).toContain("Two sum");
    expect(p).toContain("```python");
  });
  test("includes existing code and screenshot note", () => {
    const p = buildCodingPrompt({ language: "go", code: "func main(){}", screenshots: 2 });
    expect(p).toContain("func main(){}");
    expect(p).toContain("2 screenshot");
  });
  test("has a reasonable language list", () => {
    expect(CODING_LANGUAGES).toContain("python");
    expect(CODING_LANGUAGES).toContain("typescript");
  });
});

describe("POST /api/coding", () => {
  const runner = fakeRunner((cmd) => {
    if (cmd[0] === "where") return { code: 0, stdout: "x" };
    if (cmd.includes("--list-models")) return { code: 0, stdout: JSON.stringify({ default_model: "auto", models: [{ model_id: "auto" }] }) };
    return { code: 0, stdout: "```python\nreturn a+b\n```" };
  });

  test("returns provider code when available", async () => {
    const app = createApp({ runner });
    const res = await app.fetch(new Request("http://x/api/coding", {
      method: "POST",
      body: JSON.stringify({ provider: "kiro", model: "auto", language: "python", problem: "add" }),
    }));
    const j = (await res.json()) as { text: string; fallback: boolean };
    expect(j.fallback).toBe(false);
    expect(j.text).toContain("return a+b");
  });

  test("language required -> 400", async () => {
    const app = createApp({ runner });
    const res = await app.fetch(new Request("http://x/api/coding", { method: "POST", body: JSON.stringify({ provider: "kiro" }) }));
    expect(res.status).toBe(400);
  });
});
