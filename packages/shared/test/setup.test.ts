import { test, expect, describe } from "bun:test";
import {
  reconcile,
  canAssist,
  loadSetup,
  saveSetup,
  DEFAULT_SETUP,
  type SetupState,
} from "@interview-copilot/shared";
import type { ProviderInfo } from "@interview-copilot/shared";

const providers: ProviderInfo[] = [
  {
    id: "kiro",
    displayName: "Kiro",
    available: true,
    models: [
      { id: "auto", label: "auto" },
      { id: "claude-sonnet-5.5", label: "claude-sonnet-5.5" },
    ],
    defaultModel: "auto",
  },
  {
    id: "claude",
    displayName: "Claude",
    available: true,
    models: [{ id: "sonnet", label: "Sonnet" }],
    defaultModel: "sonnet",
  },
  {
    id: "cursor",
    displayName: "Cursor",
    available: false,
    unavailableReason: "cursor-agent not found on PATH",
    models: [],
  },
];

describe("reconcile (Phase 6.1/6.4)", () => {
  test("fills an empty model with the provider default", () => {
    const s = reconcile(providers, { ...DEFAULT_SETUP, provider: "kiro", model: "" });
    expect(s.model).toBe("auto");
  });

  test("switches away from an unavailable provider to the first available", () => {
    const s = reconcile(providers, { ...DEFAULT_SETUP, provider: "cursor", model: "" });
    expect(s.provider).toBe("kiro");
    expect(s.model).toBe("auto");
  });

  test("resets a model that does not belong to the chosen provider", () => {
    const s = reconcile(providers, { ...DEFAULT_SETUP, provider: "claude", model: "auto" });
    expect(s.model).toBe("sonnet");
  });

  test("keeps a valid provider+model untouched", () => {
    const s = reconcile(providers, { ...DEFAULT_SETUP, provider: "kiro", model: "claude-sonnet-5.5" });
    expect(s.provider).toBe("kiro");
    expect(s.model).toBe("claude-sonnet-5.5");
  });
});

describe("canAssist", () => {
  test("ok for an available provider with a model", () => {
    expect(canAssist(providers, { ...DEFAULT_SETUP, provider: "kiro", model: "auto" }).ok).toBe(true);
  });
  test("blocks an unavailable provider with its reason", () => {
    const r = canAssist(providers, { ...DEFAULT_SETUP, provider: "cursor", model: "" });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("cursor-agent");
  });
  test("blocks when no model chosen", () => {
    expect(canAssist(providers, { ...DEFAULT_SETUP, provider: "kiro", model: "" }).ok).toBe(false);
  });
});

describe("persistence round-trip", () => {
  test("save then load returns the same state", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const state: SetupState = {
      mode: "interviewee",
      provider: "claude",
      model: "sonnet",
      context: { jobOrRole: "Backend", background: "8y payments" },
    };
    saveSetup(storage, state);
    expect(loadSetup(storage)).toEqual(state);
  });

  test("load returns defaults when empty", () => {
    const storage = { getItem: () => null };
    expect(loadSetup(storage)).toEqual(DEFAULT_SETUP);
  });
});
