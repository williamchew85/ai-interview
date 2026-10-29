import { ONBOARDING_STEPS } from "@interview-copilot/shared";

/** Phase 21.1 — one-screen "how it works" shown on first run. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <div style={s.wrap}>
      <h1 style={s.h1}>🎯 Welcome to Interview Copilot</h1>
      <p style={s.sub}>Private AI assist over your web meeting. Four things to know:</p>
      <ol style={s.list}>
        {ONBOARDING_STEPS.map((step, i) => (
          <li key={i} style={s.item}>
            <strong>{step.title}</strong>
            <div style={s.body}>{step.body}</div>
          </li>
        ))}
      </ol>
      <button style={s.btn} onClick={onDone}>Get started</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 520, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", color: "#e8eaed" },
  h1: { fontSize: 24, margin: "0 0 4px" },
  sub: { color: "#9aa0a6", marginTop: 0 },
  list: { listStyle: "decimal", paddingLeft: 22, margin: "16px 0" },
  item: { marginBottom: 12 },
  body: { color: "#9aa0a6", fontSize: 13, marginTop: 2 },
  btn: { background: "#1b2a3f", color: "#8ab4f8", border: "1px solid #8ab4f8", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 14 },
};
