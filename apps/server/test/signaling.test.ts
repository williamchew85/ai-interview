import { test, expect, describe } from "bun:test";
import { SignalingRooms, type SignalPeer } from "../src/signaling.ts";

function peer(): SignalPeer & { inbox: unknown[] } {
  const inbox: unknown[] = [];
  return { inbox, send: (d) => void inbox.push(d) };
}

describe("SignalingRooms (Phase 2.1/2.5)", () => {
  test("first joiner does not offer; second joiner offers", () => {
    const r = new SignalingRooms();
    const a = peer();
    const b = peer();
    expect(r.join("x", a).shouldOffer).toBe(false);
    expect(r.join("x", b).shouldOffer).toBe(true);
    // existing peer A was told someone joined
    expect(a.inbox).toContainEqual({ type: "peer-joined" });
  });

  test("third peer is rejected (max 2)", () => {
    const r = new SignalingRooms();
    r.join("x", peer());
    r.join("x", peer());
    const res = r.join("x", peer());
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("full");
  });

  test("relay forwards to the other peer only", () => {
    const r = new SignalingRooms();
    const a = peer();
    const b = peer();
    r.join("x", a);
    r.join("x", b);
    r.relay("x", a, { sdp: "offer" });
    expect(b.inbox).toContainEqual({ type: "signal", data: { sdp: "offer" } });
    // A should not receive its own relay
    expect(a.inbox).not.toContainEqual({ type: "signal", data: { sdp: "offer" } });
  });

  test("leave notifies the remaining peer and frees the slot", () => {
    const r = new SignalingRooms();
    const a = peer();
    const b = peer();
    r.join("x", a);
    r.join("x", b);
    r.leave("x", a);
    expect(b.inbox).toContainEqual({ type: "peer-left" });
    expect(r.size("x")).toBe(1);
    // a new peer can now join
    expect(r.join("x", peer()).ok).toBe(true);
  });

  test("empty room is cleaned up", () => {
    const r = new SignalingRooms();
    const a = peer();
    r.join("x", a);
    r.leave("x", a);
    expect(r.size("x")).toBe(0);
  });
});
