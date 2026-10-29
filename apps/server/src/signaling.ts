/**
 * Phase 2.1 — signaling room manager (optional standalone-call mode).
 * Transport-agnostic: a "peer" is anything with a send(msg) method, so the
 * room logic is unit-testable without a real WebSocket. Exactly two peers per
 * room (this is a 1:1 interview call, not a conference).
 */
export interface SignalPeer {
  send(data: unknown): void;
}

export interface JoinResult {
  ok: boolean;
  /** Reason when not ok (e.g. room full). */
  reason?: string;
  /** True if a peer was already present (so this joiner should make the offer). */
  shouldOffer?: boolean;
}

export class SignalingRooms {
  private rooms = new Map<string, Set<SignalPeer>>();

  join(room: string, peer: SignalPeer): JoinResult {
    let set = this.rooms.get(room);
    if (!set) {
      set = new Set();
      this.rooms.set(room, set);
    }
    if (set.size >= 2 && !set.has(peer)) {
      return { ok: false, reason: "room full (max 2)" };
    }
    const hadPeer = set.size >= 1;
    set.add(peer);
    if (hadPeer) {
      // Tell the existing peer(s) someone joined.
      for (const p of set) if (p !== peer) p.send({ type: "peer-joined" });
    }
    return { ok: true, shouldOffer: hadPeer };
  }

  /** Relay an opaque signaling payload to the OTHER peer(s) in the room. */
  relay(room: string, from: SignalPeer, data: unknown): void {
    const set = this.rooms.get(room);
    if (!set) return;
    for (const p of set) if (p !== from) p.send({ type: "signal", data });
  }

  leave(room: string, peer: SignalPeer): void {
    const set = this.rooms.get(room);
    if (!set) return;
    set.delete(peer);
    for (const p of set) p.send({ type: "peer-left" });
    if (set.size === 0) this.rooms.delete(room);
  }

  size(room: string): number {
    return this.rooms.get(room)?.size ?? 0;
  }
}
