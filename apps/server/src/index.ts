import { createApp } from "./app.ts";
import { SignalingRooms, type SignalPeer } from "./signaling.ts";

const port = Number(process.env.PORT ?? 8791);
const app = createApp();
const rooms = new SignalingRooms();

interface WsData {
  room: string;
  peer: SignalPeer;
}

Bun.serve<WsData>({
  port,
  hostname: "127.0.0.1",
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const room = url.searchParams.get("room") ?? "default";
      const ok = server.upgrade(req, { data: { room, peer: undefined as unknown as SignalPeer } });
      return ok ? undefined : new Response("upgrade failed", { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const peer: SignalPeer = { send: (d) => ws.send(JSON.stringify(d)) };
      ws.data.peer = peer;
      const res = rooms.join(ws.data.room, peer);
      ws.send(JSON.stringify({ type: "joined", ...res }));
    },
    message(ws, raw) {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; data?: unknown };
        if (msg.type === "signal") rooms.relay(ws.data.room, ws.data.peer, msg.data);
      } catch {
        /* ignore malformed */
      }
    },
    close(ws) {
      rooms.leave(ws.data.room, ws.data.peer);
    },
  },
});

console.log(`[interview-copilot] server on http://127.0.0.1:${port} (+ /ws signaling)`);
