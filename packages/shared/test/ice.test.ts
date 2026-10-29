import { test, expect, describe } from "bun:test";
import { buildIceConfig, DEFAULT_STUN_URLS } from "@interview-copilot/shared";

describe("buildIceConfig (Phase 8 — TURN relay)", () => {
  test("STUN-only when no TURN configured", () => {
    const cfg = buildIceConfig({});
    expect(cfg.hasTurn).toBe(false);
    expect(cfg.iceServers).toHaveLength(1);
    expect(cfg.iceServers[0]!.urls).toEqual(DEFAULT_STUN_URLS);
  });

  test("adds a TURN relay with credentials when configured", () => {
    const cfg = buildIceConfig({
      TURN_URLS: "turn:relay.example.com:3478,turns:relay.example.com:5349",
      TURN_USERNAME: "user1",
      TURN_PASSWORD: "secret",
    });
    expect(cfg.hasTurn).toBe(true);
    expect(cfg.iceServers).toHaveLength(2);
    const turn = cfg.iceServers[1]!;
    expect(turn.urls).toEqual(["turn:relay.example.com:3478", "turns:relay.example.com:5349"]);
    expect(turn.username).toBe("user1");
    expect(turn.credential).toBe("secret");
  });

  test("TURN without credentials still registers the relay", () => {
    const cfg = buildIceConfig({ TURN_URLS: "turn:relay.example.com:3478" });
    expect(cfg.hasTurn).toBe(true);
    expect(cfg.iceServers[1]!.username).toBeUndefined();
    expect(cfg.iceServers[1]!.credential).toBeUndefined();
  });

  test("STUN_URLS overrides the default STUN list", () => {
    const cfg = buildIceConfig({ STUN_URLS: "stun:stun.custom.net:3478" });
    expect(cfg.iceServers[0]!.urls).toEqual(["stun:stun.custom.net:3478"]);
  });

  test("ignores blank/whitespace entries", () => {
    const cfg = buildIceConfig({ TURN_URLS: " turn:a:3478 , , turn:b:3478 " });
    expect(cfg.iceServers[1]!.urls).toEqual(["turn:a:3478", "turn:b:3478"]);
  });
});
