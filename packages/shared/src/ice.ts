/**
 * Phase 8 — ICE / TURN relay configuration.
 *
 * The standalone WebRTC call (Phase 2) works peer-to-peer over STUN for most
 * networks, but symmetric NATs and strict firewalls need a TURN relay. The
 * server exposes GET /api/ice so the client never hardcodes credentials; the
 * operator supplies TURN via env (e.g. a self-hosted coturn) and the list
 * degrades gracefully to public STUN when no TURN is configured.
 *
 * Pure + env-injectable so it is testable without a live server.
 */

/** A WebRTC ICE server entry (mirrors RTCIceServer, kept dependency-free). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** The ICE config returned to the client by GET /api/ice. */
export interface IceConfig {
  iceServers: IceServer[];
  /** True when at least one TURN relay is configured (symmetric-NAT capable). */
  hasTurn: boolean;
}

/** Public STUN fallback used when the operator configures no TURN relay. */
export const DEFAULT_STUN_URLS: string[] = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

/**
 * Environment keys the operator sets to enable a TURN relay:
 *   TURN_URLS      comma-separated turn(s): urls, e.g. "turn:relay.example.com:3478,turns:relay.example.com:5349"
 *   TURN_USERNAME  long-term credential username (or ephemeral user)
 *   TURN_PASSWORD  long-term credential / ephemeral password
 *   STUN_URLS      optional override of the default STUN list (comma-separated)
 */
export interface IceEnv {
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_PASSWORD?: string;
  STUN_URLS?: string;
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the ICE server list from environment. Deterministic and side-effect
 * free: pass the env map in (e.g. process.env / Bun.env) so it is unit-testable.
 */
export function buildIceConfig(env: IceEnv = {}): IceConfig {
  const stunUrls = splitList(env.STUN_URLS);
  const servers: IceServer[] = [
    { urls: stunUrls.length > 0 ? stunUrls : DEFAULT_STUN_URLS },
  ];

  const turnUrls = splitList(env.TURN_URLS);
  let hasTurn = false;
  if (turnUrls.length > 0) {
    const entry: IceServer = { urls: turnUrls };
    if (env.TURN_USERNAME) entry.username = env.TURN_USERNAME;
    if (env.TURN_PASSWORD) entry.credential = env.TURN_PASSWORD;
    servers.push(entry);
    hasTurn = true;
  }

  return { iceServers: servers, hasTurn };
}
