import type { ModelInfo } from "@interview-copilot/shared";
import {
  bunRunner,
  binaryExists,
  type Provider,
  type Runner,
} from "./provider.ts";

/**
 * Cursor adapter: `cursor-agent`. NOT installed on the dev host today, so
 * isAvailable() returns false and listModels() returns [] — we never seed
 * guessed model ids. When the binary is present, the model list is populated
 * from its own discovery (left as [] here until a real --list surface exists).
 */
export class CursorProvider implements Provider {
  readonly id = "cursor" as const;
  readonly displayName = "Cursor";
  private reason: string | undefined;
  private bin = "cursor-agent";

  constructor(private run: Runner = bunRunner) {}

  async isAvailable(): Promise<boolean> {
    const ok = await binaryExists(this.bin, this.run);
    this.reason = ok ? undefined : `${this.bin} not found on PATH`;
    return ok;
  }

  unavailableReason(): string | undefined {
    return this.reason;
  }

  async listModels(): Promise<ModelInfo[]> {
    // No documented machine-readable model list and the binary is absent here.
    // Return nothing rather than guess.
    return [];
  }

  async defaultModel(): Promise<string | undefined> {
    return undefined;
  }

  async generate(
    prompt: string,
    opts: { model?: string; signal?: AbortSignal },
  ): Promise<string> {
    const cmd = [this.bin];
    if (opts.model) cmd.push("--model", opts.model);
    cmd.push(prompt);
    const r = await this.run(cmd, { signal: opts.signal });
    if (r.code !== 0) {
      throw new Error(
        `cursor-agent exited ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`,
      );
    }
    return r.stdout.trim();
  }
}
