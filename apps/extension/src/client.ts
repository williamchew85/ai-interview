import type {
  AssistRequest,
  Mode,
  ProviderId,
  ProviderInfo,
  Suggestion,
  TranscriptLine,
} from "@interview-copilot/shared";

const DEFAULT_BASE = "http://127.0.0.1:8791";

export function serverBase(): string {
  return DEFAULT_BASE;
}

export async function fetchProviders(
  base = serverBase(),
): Promise<ProviderInfo[]> {
  const res = await fetch(`${base}/api/providers`);
  if (!res.ok) throw new Error(`providers ${res.status}`);
  return (await res.json()) as ProviderInfo[];
}

export async function assist(
  req: AssistRequest,
  base = serverBase(),
): Promise<Suggestion> {
  const res = await fetch(`${base}/api/assist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`assist ${res.status}`);
  return (await res.json()) as Suggestion;
}

/** Stream a suggestion via SSE; calls onChunk per line, resolves on done. */
export async function assistStream(
  req: AssistRequest,
  handlers: {
    onMeta?: (m: { provider: ProviderId; model: string; fallback: boolean }) => void;
    onChunk?: (text: string) => void;
    onDone?: () => void;
    onError?: (msg: string) => void;
  },
  signal?: AbortSignal,
  base = serverBase(),
): Promise<void> {
  const res = await fetch(`${base}/api/assist/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    handlers.onError?.(`stream ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const ev of events) {
      const typeMatch = ev.match(/^event: (.+)$/m);
      const dataMatch = ev.match(/^data: (.+)$/m);
      if (!typeMatch || !dataMatch) continue;
      const type = typeMatch[1];
      const data = JSON.parse(dataMatch[1]!);
      if (type === "meta") handlers.onMeta?.(data);
      else if (type === "chunk") handlers.onChunk?.(data.text);
      else if (type === "done") handlers.onDone?.();
      else if (type === "error") handlers.onError?.(data.message);
    }
  }
}

export interface WidgetSettings {
  mode: Mode;
  provider: ProviderId;
  model: string;
  visible: boolean;
  compact: boolean;
  /** When true, auto-hide the widget while the user is screen-sharing. */
  screenShareSafe: boolean;
  /** Panel opacity 0.4–1. */
  opacity: number;
  /** Phase 17: auto vs manual answer mode. */
  answerMode: "auto" | "manual";
  /** Phase 18: coding-mode language. */
  codingLanguage: string;
  jobOrRole?: string;
  focusAreas?: string;
  background?: string;
  pos?: { x: number; y: number };
}

export const DEFAULT_SETTINGS: WidgetSettings = {
  mode: "interviewer",
  provider: "kiro",
  model: "auto",
  visible: true,
  compact: true,
  screenShareSafe: true,
  opacity: 1,
  answerMode: "manual",
  codingLanguage: "python",
};

const STORAGE_KEY = "ic_settings";

export async function loadSettings(): Promise<WidgetSettings> {
  try {
    const got = await chrome.storage.local.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(got[STORAGE_KEY] ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Partial<WidgetSettings>): Promise<void> {
  try {
    const cur = await loadSettings();
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...cur, ...s } });
  } catch {
    /* storage unavailable in some contexts; non-fatal */
  }
}

export function assistRequestFrom(
  s: WidgetSettings,
  transcript: TranscriptLine[],
): AssistRequest {
  return {
    mode: s.mode,
    provider: s.provider,
    model: s.model,
    transcript,
    context: {
      jobOrRole: s.jobOrRole,
      focusAreas: s.focusAreas,
      background: s.background,
    },
  };
}
