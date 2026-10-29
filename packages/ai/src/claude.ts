import type { ModelInfo } from "@interview-copilot/shared";
import {
  bunRunner,
  binaryExists,
  type Provider,
  type Runner,
} from "./provider.ts";

/**
 * Claude adapter: `claude -p --model <alias> "<prompt>"`.
 * The CLI does not expose a machine-readable model list, so we offer the
 * documented aliases (not guessed full version ids).
 */
export class ClaudeProvider implements Provider {
  readonly id = "claude" as const;
  readonly displayName = "Claude";
  private reason: string | undefined;
  private bin = "claude";

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
    // Documented aliases accepted by `--model` (see `claude --help`).
    return [
      { id: "opus", label: "Opus", description: "Most capable" },
      { id: "sonnet", label: "Sonnet", description: "Balanced (default)" },
      { id: "haiku", label: "Haiku", description: "Fastest / cheapest" },
    ];
  }

  async defaultModel(): Promise<string | undefined> {
    return "sonnet";
  }

  async generate(
    prompt: string,
    opts: { model?: string; signal?: AbortSignal },
  ): Promise<string> {
    const cmd = [this.bin, "-p"];
    if (opts.model) cmd.push("--model", opts.model);
    cmd.push(prompt);
    const r = await this.run(cmd, { signal: opts.signal });
    if (r.code !== 0) {
      throw new Error(
        `claude exited ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`,
      );
    }
    return r.stdout.trim();
  }
}
