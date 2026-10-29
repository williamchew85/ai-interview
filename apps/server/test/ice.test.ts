import { test, expect, describe } from "bun:test";
import { createApp } from "../src/app.ts";
import type { IceConfig } from "@interview-copilot/shared";

describe("GET /api/ice (Phase 8)", () => {
  test("returns an ICE config with at least a STUN server", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://x/api/ice"));
    expect(res.status).toBe(200);
    const cfg = (await res.json()) as IceConfig;
    expect(Array.isArray(cfg.iceServers)).toBe(true);
    expect(cfg.iceServers.length).toBeGreaterThanOrEqual(1);
    // In CI/dev with no TURN_URLS env, it is STUN-only.
    expect(typeof cfg.hasTurn).toBe("boolean");
  });
});
