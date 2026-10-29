import type { ProviderId, ProviderInfo } from "@interview-copilot/shared";
import type { Provider, Runner } from "./provider.ts";
import { bunRunner } from "./provider.ts";
import { KiroProvider } from "./kiro.ts";
import { ClaudeProvider } from "./claude.ts";
import { CursorProvider } from "./cursor.ts";

/**
 * Holds all provider adapters, probes availability, and exposes the data the
 * UI needs for GET /api/providers. Build once at server start.
 */
export class ProviderRegistry {
  private providers: Map<ProviderId, Provider>;

  constructor(run: Runner = bunRunner) {
    const list: Provider[] = [
      new KiroProvider(run),
      new ClaudeProvider(run),
      new CursorProvider(run),
    ];
    this.providers = new Map(list.map((p) => [p.id, p]));
  }

  get(id: ProviderId): Provider | undefined {
    return this.providers.get(id);
  }

  /** Probe every adapter and return UI-facing info (available + models). */
  async describe(): Promise<ProviderInfo[]> {
    const out: ProviderInfo[] = [];
    for (const p of this.providers.values()) {
      const available = await p.isAvailable();
      const models = available ? await p.listModels() : [];
      const defaultModel = available ? await p.defaultModel() : undefined;
      out.push({
        id: p.id,
        displayName: p.displayName,
        available,
        unavailableReason: available ? undefined : p.unavailableReason(),
        models,
        defaultModel,
      });
    }
    return out;
  }
}
