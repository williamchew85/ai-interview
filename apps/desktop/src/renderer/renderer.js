/* global window, document, fetch */
// Minimal renderer for the Electron overlay (Phase 20). Talks to the local
// server and drives the shield/click-through through the preload bridge.
const api = window.desktopAPI;
const SERVER = "http://127.0.0.1:8791";

const $ = (id) => document.getElementById(id);
let shieldOn = true;

async function refreshShield() {
  shieldOn = await api.shield.get();
  paintShield();
}
function paintShield() {
  const b = $("shield");
  b.classList.toggle("shield-on", shieldOn);
  b.textContent = shieldOn ? "🛡 Shield on" : "🛡 Shield off";
}

$("shield").addEventListener("click", async () => {
  shieldOn = await api.shield.toggle();
  paintShield();
});
api.shield.onStatus((on) => { shieldOn = on; paintShield(); });

$("hide").addEventListener("click", () => api.window.hide());
$("clickthrough").addEventListener("click", () => api.clickThrough.toggle());

async function checkServer() {
  try {
    const r = await fetch(`${SERVER}/api/health`);
    const j = await r.json();
    $("status").textContent = j.ok ? "server: connected" : "server: error";
  } catch {
    $("status").textContent = "server: start the local Bun server";
  }
}

async function suggest() {
  $("sug").textContent = "generating…";
  try {
    const res = await fetch(`${SERVER}/api/assist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "interviewer",
        provider: "kiro",
        model: "auto",
        transcript: [{ id: "1", speaker: "remote", text: "Tell me about a hard project.", final: true, ts: Date.now() }],
      }),
    });
    const sug = await res.json();
    $("sug").textContent = sug.text + (sug.fallback ? "\n\n(fallback)" : "");
  } catch {
    $("sug").textContent = "Copilot server unreachable — start the local server.";
  }
}

$("suggest").addEventListener("click", suggest);
api.onShortcut((action) => { if (action === "ask") suggest(); });

void refreshShield();
void checkServer();
