import type { ProviderInfo } from "@interview-copilot/shared";

export const SERVER_BASE = "http://127.0.0.1:8791";

export async function fetchProviders(): Promise<ProviderInfo[]> {
  const res = await fetch(`${SERVER_BASE}/api/providers`);
  if (!res.ok) throw new Error(`providers ${res.status}`);
  return (await res.json()) as ProviderInfo[];
}
