import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderInfo } from "@interview-copilot/shared";
import {
  reconcile,
  canAssist,
  loadSetup,
  saveSetup,
  selectedProvider,
  guessRoleTitle,
  type SetupState,
} from "@interview-copilot/shared";
import { fetchProviders } from "./api.ts";
import { extractCvText, CvParseError } from "./cv-extract.ts";

export function SetupScreen() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [state, setState] = useState<SetupState>(() => loadSetup(localStorage));

  useEffect(() => {
    fetchProviders()
      .then((p) => {
        setProviders(p);
        setState((s) => reconcile(p, s));
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    saveSetup(localStorage, state);
  }, [state]);

  const provider = selectedProvider(providers, state.provider);
  const ready = useMemo(() => canAssist(providers, state), [providers, state]);

  function patch(p: Partial<SetupState>) {
    setState((s) => reconcile(providers, { ...s, ...p }));
  }
  function patchContext(p: Partial<SetupState["context"]>) {
    setState((s) => ({ ...s, context: { ...s.context, ...p } }));
  }

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>🎯 Interview Copilot</h1>
      <p style={styles.sub}>Set up your session, then open the widget in your meeting.</p>

      {loadError && (
        <div style={styles.warn}>
          Can't reach the local server ({loadError}). Start it with{" "}
          <code>bun run --cwd apps/server start</code>.
        </div>
      )}

      <section style={styles.card}>
        <label style={styles.label}>Mode</label>
        <div style={styles.row}>
          <ModeButton
            active={state.mode === "interviewer"}
            onClick={() => patch({ mode: "interviewer" })}
            title="Interviewer"
            desc="Suggest deeper follow-up questions"
          />
          <ModeButton
            active={state.mode === "interviewee"}
            onClick={() => patch({ mode: "interviewee" })}
            title="Interviewee"
            desc="Draft answers to the questions"
          />
        </div>

        <label style={styles.label}>Provider</label>
        <select
          style={styles.input}
          value={state.provider}
          onChange={(e) => patch({ provider: e.target.value as SetupState["provider"] })}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.available}>
              {p.displayName}
              {p.available ? "" : ` — unavailable (${p.unavailableReason ?? "not installed"})`}
            </option>
          ))}
          {!providers.length && <option>Loading…</option>}
        </select>

        <label style={styles.label}>Model</label>
        <select
          style={styles.input}
          value={state.model}
          onChange={(e) => patch({ model: e.target.value })}
          disabled={!provider?.models.length}
        >
          {(provider?.models ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.description ? ` — ${m.description}` : ""}
            </option>
          ))}
          {!provider?.models.length && <option value="">(no models)</option>}
        </select>

        {state.mode === "interviewer" ? (
          <>
            <label style={styles.label}>Role being interviewed for</label>
            <input
              style={styles.input}
              value={state.context.jobOrRole ?? ""}
              onChange={(e) => patchContext({ jobOrRole: e.target.value })}
              placeholder="e.g. Staff Software Engineer"
            />
            <label style={styles.label}>Focus areas</label>
            <input
              style={styles.input}
              value={state.context.focusAreas ?? ""}
              onChange={(e) => patchContext({ focusAreas: e.target.value })}
              placeholder="e.g. distributed systems, leadership"
            />
          </>
        ) : (
          <>
            <label style={styles.label}>Role you're applying for</label>
            <input
              style={styles.input}
              value={state.context.jobOrRole ?? ""}
              onChange={(e) => patchContext({ jobOrRole: e.target.value })}
              placeholder="e.g. Senior Backend Engineer"
            />
            <label style={styles.label}>Your background</label>
            <CvUpload
              onText={(text, roleGuess) =>
                patchContext({
                  background: text,
                  ...(roleGuess && !state.context.jobOrRole ? { jobOrRole: roleGuess } : {}),
                })
              }
            />
            <textarea
              style={{ ...styles.input, minHeight: 72, resize: "vertical" }}
              value={state.context.background ?? ""}
              onChange={(e) => patchContext({ background: e.target.value })}
              placeholder="Resume bullets / key experience the AI should ground answers in — or upload your CV above"
            />
          </>
        )}
      </section>

      <div style={ready.ok ? styles.ready : styles.notReady}>
        {ready.ok
          ? `Ready — ${provider?.displayName} · ${state.model}. Open the extension widget in your Meet/Teams tab.`
          : `Not ready: ${ready.reason}`}
      </div>
    </div>
  );
}

function CvUpload({ onText }: { onText: (text: string, roleGuess?: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const [dragOver, setDragOver] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setStatus("parsing");
    setError(undefined);
    setFileName(file.name);
    try {
      const text = await extractCvText(file);
      onText(text, guessRoleTitle(text));
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof CvParseError ? e.message : (e as Error).message);
    }
  }

  function clear() {
    setStatus("idle");
    setFileName(undefined);
    setError(undefined);
    if (inputRef.current) inputRef.current.value = "";
    onText("");
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handle(e.dataTransfer.files?.[0]); }}
        style={{ ...cvStyles.drop, ...(dragOver ? cvStyles.dropOver : {}) }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          style={{ display: "none" }}
          onChange={(e) => void handle(e.target.files?.[0] ?? undefined)}
        />
        {status === "parsing" ? (
          <span>Parsing {fileName}…</span>
        ) : status === "done" ? (
          <span style={{ color: "#81c995" }}>✓ Loaded {fileName} — edit below if needed</span>
        ) : (
          <span style={{ color: "#9aa0a6" }}>📄 Upload CV (.pdf, .docx, .txt) or drag it here</span>
        )}
      </div>
      {error && <div style={cvStyles.err}>{error}</div>}
      {(status === "done" || status === "error") && (
        <button type="button" onClick={clear} style={cvStyles.clear}>Clear</button>
      )}
    </div>
  );
}

function ModeButton(props: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      onClick={props.onClick}
      style={{ ...styles.mode, ...(props.active ? styles.modeActive : {}) }}
    >
      <strong>{props.title}</strong>
      <span style={{ display: "block", fontSize: 12, opacity: 0.8 }}>{props.desc}</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 520, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", color: "#e8eaed" },
  h1: { fontSize: 24, margin: "0 0 4px" },
  sub: { color: "#9aa0a6", marginTop: 0 },
  card: { background: "#1f2023", border: "1px solid #3a3d42", borderRadius: 12, padding: 16 },
  label: { display: "block", fontSize: 12, color: "#9aa0a6", margin: "12px 0 4px" },
  input: { width: "100%", boxSizing: "border-box", background: "#17181a", color: "#e8eaed", border: "1px solid #3a3d42", borderRadius: 8, padding: 8, font: "inherit" },
  row: { display: "flex", gap: 8 },
  mode: { flex: 1, textAlign: "left", background: "#17181a", color: "#e8eaed", border: "1px solid #3a3d42", borderRadius: 8, padding: 10, cursor: "pointer" },
  modeActive: { borderColor: "#8ab4f8", background: "#1b2a3f" },
  warn: { background: "#3b2f17", color: "#fdd663", border: "1px solid #5c4a1f", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 },
  ready: { marginTop: 14, padding: 10, borderRadius: 8, background: "#17291b", color: "#81c995", border: "1px solid #2f5133", fontSize: 13 },
  notReady: { marginTop: 14, padding: 10, borderRadius: 8, background: "#2a2d31", color: "#9aa0a6", border: "1px solid #3a3d42", fontSize: 13 },
};

const cvStyles: Record<string, React.CSSProperties> = {
  drop: { border: "1px dashed #3a3d42", borderRadius: 8, padding: 12, textAlign: "center", cursor: "pointer", fontSize: 13, background: "#17181a" },
  dropOver: { borderColor: "#8ab4f8", background: "#1b2a3f" },
  err: { color: "#f28b82", fontSize: 12, marginTop: 6 },
  clear: { marginTop: 6, background: "transparent", color: "#8ab4f8", border: "none", cursor: "pointer", fontSize: 12, padding: 0 },
};
