import { useEffect, useRef, useState } from "react";
import type { TranscriptLine, IceConfig } from "@interview-copilot/shared";
import { DEFAULT_STUN_URLS, renderSessionMarkdown, exportFilename } from "@interview-copilot/shared";
import { TranscriptMerger, WebSpeechSttProvider, isSupported } from "@interview-copilot/stt";

const SERVER_WS = "ws://127.0.0.1:8791/ws";
const SERVER_HTTP = "http://127.0.0.1:8791";
const FALLBACK_ICE: RTCIceServer[] = [{ urls: DEFAULT_STUN_URLS }];

/** Fetch ICE/TURN config from the server (Phase 8); fall back to public STUN. */
async function fetchIce(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${SERVER_HTTP}/api/ice`);
    const cfg = (await res.json()) as IceConfig;
    if (Array.isArray(cfg.iceServers) && cfg.iceServers.length > 0) {
      return cfg.iceServers as RTCIceServer[];
    }
  } catch { /* server down / offline: use STUN fallback */ }
  return FALLBACK_ICE;
}

type ConnState = "idle" | "connecting" | "connected" | "peer-left" | "error";

/**
 * Phase 2.2-2.4 + 3.3 — standalone 1:1 WebRTC call (optional mode; the overlay
 * is the primary surface). ICE/TURN comes from GET /api/ice (Phase 8): STUN by
 * default, plus a TURN relay for symmetric NATs when the operator configures
 * one. Each peer runs Web Speech on its OWN mic and sends finals over a data
 * channel; the other side re-tags them speaker="remote" and the TranscriptMerger
 * unifies both.
 */
export function CallScreen({ room }: { room: string }) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const stt = useRef<WebSpeechSttProvider | null>(null);
  const merger = useRef(new TranscriptMerger());
  const [state, setState] = useState<ConnState>("idle");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [error, setError] = useState<string>();
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  useEffect(() => {
    let cancelled = false;

    function pushLine(l: { speaker: "local" | "remote"; text: string; final: boolean }) {
      setTranscript(merger.current.push(l).slice(-40));
    }

    function startStt() {
      if (!isSupported()) return;
      const p = new WebSpeechSttProvider();
      stt.current = p;
      try {
        p.start(
          null,
          (line) => pushLine({ speaker: "local", text: line.text, final: false }),
          (line) => {
            pushLine({ speaker: "local", text: line.text, final: true });
            const dc = dcRef.current;
            if (dc && dc.readyState === "open") {
              dc.send(JSON.stringify({ t: "line", text: line.text }));
            }
          },
        );
      } catch { /* unsupported; silently skip */ }
    }

    function wireDataChannel(dc: RTCDataChannel) {
      dcRef.current = dc;
      dc.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.t === "line") pushLine({ speaker: "remote", text: m.text, final: true });
        } catch { /* ignore */ }
      };
    }

    async function start() {
      setState("connecting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStream.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;

        const iceServers = await fetchIce();
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        // The offerer creates the data channel; the answerer receives it.
        pc.ondatachannel = (e) => wireDataChannel(e.channel);

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
            wireDataChannel(pc.createDataChannel("transcript"));
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

        startStt();
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
      stt.current?.stop();
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

  const [exporting, setExporting] = useState(false);

  /** Phase 10 — explicit, user-initiated export of transcript + AI summary to Markdown. */
  async function exportSession() {
    setExporting(true);
    try {
      let summary = "";
      try {
        const res = await fetch(`${SERVER_HTTP}/api/summary`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "interviewee", transcript }),
        });
        const j = (await res.json()) as { summary?: string };
        summary = j.summary ?? "";
      } catch { /* summary is best-effort; export transcript regardless */ }

      const md = renderSessionMarkdown({
        title: `Interview Copilot — room ${room}`,
        transcript,
        suggestions: [],
        summary,
        startedAt: transcript[0]?.ts,
      });
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename({ startedAt: transcript[0]?.ts });
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.bar}>
        <strong>Room: {room}</strong>
        <span style={s.state}>{label(state)}</span>
      </div>
      {error && <div style={s.err}>{error}</div>}
      {!isSupported() && (
        <div style={s.warn}>Live transcription needs Chrome/Edge (Web Speech API). The call still works.</div>
      )}
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
        <button style={s.btn} onClick={exportSession} disabled={exporting || transcript.length === 0}>
          {exporting ? "Exporting…" : "Export .md"}
        </button>
      </div>
      <div style={s.transcript}>
        <div style={s.tHead}>Transcript</div>
        {transcript.length === 0 ? (
          <div style={s.tEmpty}>Speech appears here as you and your peer talk.</div>
        ) : (
          transcript.map((l) => (
            <div key={l.id} style={{ ...s.line, color: l.speaker === "local" ? "#81c995" : "#8ab4f8" }}>
              <strong>{l.speaker === "local" ? "You" : "Them"}:</strong>{" "}
              <span style={{ color: "#e8eaed", opacity: l.final ? 1 : 0.6 }}>{l.text}</span>
            </div>
          ))
        )}
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
  warn: { background: "#3b2f17", color: "#fdd663", border: "1px solid #5c4a1f", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tile: { position: "relative", background: "#000", borderRadius: 10, overflow: "hidden", aspectRatio: "4 / 3" },
  video: { width: "100%", height: "100%", objectFit: "cover" },
  tag: { position: "absolute", left: 8, bottom: 8, background: "rgba(0,0,0,.55)", padding: "2px 8px", borderRadius: 6, fontSize: 12 },
  controls: { display: "flex", gap: 8, marginTop: 12, justifyContent: "center" },
  btn: { background: "#2a2d31", color: "#e8eaed", border: "1px solid #3a3d42", borderRadius: 8, padding: "8px 14px", cursor: "pointer" },
  transcript: { marginTop: 16, background: "#1f2023", border: "1px solid #3a3d42", borderRadius: 10, padding: 12, maxHeight: 200, overflow: "auto" },
  tHead: { fontSize: 12, color: "#9aa0a6", marginBottom: 6 },
  tEmpty: { color: "#9aa0a6", fontSize: 13 },
  line: { margin: "3px 0", fontSize: 14 },
};
