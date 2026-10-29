import { useEffect, useRef, useState } from "react";

const SERVER_WS = "ws://127.0.0.1:8791/ws";
const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

type ConnState = "idle" | "connecting" | "connected" | "peer-left" | "error";

/**
 * Phase 2.2-2.4 — standalone 1:1 WebRTC call (optional mode; the overlay is the
 * primary surface). STUN-only (D2); TURN is Phase 8.
 */
export function CallScreen({ room }: { room: string }) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ConnState>("idle");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setState("connecting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStream.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({ iceServers: ICE });
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.ontrack = (e) => {
          if (remoteRef.current) remoteRef.current.srcObject = e.streams[0] ?? null;
          setState("connected");
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) send({ type: "signal", data: { candidate: e.candidate } });
        };

        const ws = new WebSocket(`${SERVER_WS}?room=${encodeURIComponent(room)}`);
        wsRef.current = ws;
        ws.onmessage = async (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.type === "joined" && msg.shouldOffer) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ type: "signal", data: { sdp: pc.localDescription } });
          } else if (msg.type === "peer-left") {
            setState("peer-left");
          } else if (msg.type === "signal") {
            const d = msg.data;
            if (d.sdp) {
              await pc.setRemoteDescription(d.sdp);
              if (d.sdp.type === "offer") {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                send({ type: "signal", data: { sdp: pc.localDescription } });
              }
            } else if (d.candidate) {
              await pc.addIceCandidate(d.candidate).catch(() => {});
            }
          }
        };
        ws.onerror = () => { setError("signaling connection failed"); setState("error"); };
      } catch (e) {
        setError((e as Error).message);
        setState("error");
      }
    }

    function send(obj: unknown) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    }

    void start();
    return () => {
      cancelled = true;
      pcRef.current?.close();
      wsRef.current?.close();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [room]);

  function toggleMute() {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) { track.enabled = muted; setMuted(!muted); }
  }
  function toggleCam() {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) { track.enabled = camOff; setCamOff(!camOff); }
  }

  return (
    <div style={s.wrap}>
      <div style={s.bar}>
        <strong>Room: {room}</strong>
        <span style={s.state}>{label(state)}</span>
      </div>
      {error && <div style={s.err}>{error}</div>}
      <div style={s.grid}>
        <div style={s.tile}>
          <video ref={localRef} autoPlay muted playsInline style={s.video} />
          <span style={s.tag}>You</span>
        </div>
        <div style={s.tile}>
          <video ref={remoteRef} autoPlay playsInline style={s.video} />
          <span style={s.tag}>Them</span>
        </div>
      </div>
      <div style={s.controls}>
        <button style={s.btn} onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
        <button style={s.btn} onClick={toggleCam}>{camOff ? "Camera on" : "Camera off"}</button>
      </div>
    </div>
  );
}

function label(st: ConnState): string {
  return { idle: "", connecting: "Connecting…", connected: "Connected", "peer-left": "Peer left", error: "Error" }[st];
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 820, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", color: "#e8eaed" },
  bar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  state: { color: "#9aa0a6", fontSize: 13 },
  err: { background: "#3b1d1d", color: "#f28b82", border: "1px solid #5c2a2a", borderRadius: 8, padding: 10, marginBottom: 12 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tile: { position: "relative", background: "#000", borderRadius: 10, overflow: "hidden", aspectRatio: "4 / 3" },
  video: { width: "100%", height: "100%", objectFit: "cover" },
  tag: { position: "absolute", left: 8, bottom: 8, background: "rgba(0,0,0,.55)", padding: "2px 8px", borderRadius: 6, fontSize: 12 },
  controls: { display: "flex", gap: 8, marginTop: 12, justifyContent: "center" },
  btn: { background: "#2a2d31", color: "#e8eaed", border: "1px solid #3a3d42", borderRadius: 8, padding: "8px 14px", cursor: "pointer" },
};
