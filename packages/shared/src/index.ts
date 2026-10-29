/**
 * Shared domain types for Interview Copilot.
 * Imported by the server, the provider adapters, and the extension/web UI.
 */

/** The two assist modes. */
export type Mode = "interviewer" | "interviewee";

/** Known AI provider ids. */
export type ProviderId = "kiro" | "claude" | "cursor";

/** A single model offered by a provider. */
export interface ModelInfo {
  /** Stable id passed to the provider CLI (e.g. "claude-sonnet-5.5", "opus"). */
  id: string;
  /** Human label for the picker. */
  label: string;
  /** Optional one-line description. */
  description?: string;
}

/** A provider as reported to the UI by GET /api/providers. */
export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  /** Whether the backing CLI was found on this host. */
  available: boolean;
  /** When unavailable, why (e.g. "cursor-agent not found on PATH"). */
  unavailableReason?: string;
  /** Models to populate the picker; empty when unavailable. */
  models: ModelInfo[];
  /** Model id used when the caller does not specify one. */
  defaultModel?: string;
}

/** Who said a transcript line. */
export type Speaker = "local" | "remote" | "unknown";

/** One line of conversation transcript. */
export interface TranscriptLine {
  id: string;
  speaker: Speaker;
  /** Optional display name parsed from meeting captions. */
  speakerName?: string;
  text: string;
  /** Final vs interim (captions re-render partial -> final). */
  final: boolean;
  /** Epoch ms. */
  ts: number;
}

/** A single AI suggestion (a follow-up question, or a drafted answer). */
export interface Suggestion {
  id: string;
  mode: Mode;
  text: string;
  provider: ProviderId;
  model: string;
  /** True when produced by the keyless deterministic fallback, not an LLM. */
  fallback: boolean;
  ts: number;
}

/** Role context the user enters before/while assisting. */
export interface RoleContext {
  /** Interviewer: job title / focus areas. Interviewee: background / resume bullets. */
  jobOrRole?: string;
  focusAreas?: string;
  background?: string;
}

/** Request body for POST /api/assist. */
export interface AssistRequest {
  mode: Mode;
  provider: ProviderId;
  model: string;
  /** Recent transcript lines (most recent last). */
  transcript: TranscriptLine[];
  context?: RoleContext;
  /** Disable the LLM call and force the deterministic suggester (used in tests/CI). */
  forceFallback?: boolean;
}

/** WebSocket envelope types (signaling + standalone-call path, Phase 2). */
export type WsMessage =
  | { type: "join"; room: string }
  | { type: "peer-joined" }
  | { type: "peer-left" }
  | { type: "signal"; data: unknown };
