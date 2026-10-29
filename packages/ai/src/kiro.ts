import type { ModelInfo } from "@interview-copilot/shared";
import {
  bunRunner,
  binaryExists,
  type Provider,
  type Runner,
} from "./provider.ts";

/**
 * Kiro adapter: `kiro-cli chat --no-interactive --model <id> "<prompt>"`.
 * Models come from `kiro-cli chat --list-models --format json`.
 */
export class KiroProvider implements Provider {
  readonly id = "kiro" as const;
  readonly displayName = "Kiro";
  private reason: string | undefined;
  private bin = "kiro-cli";

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
    try {
      const r = await this.run([
        this.bin,
        "chat",
        "--list-models",
        "--format",
        "json",
      ]);
      if (r.code !== 0) return [];
      const parsed = JSON.parse(r.stdout) as {
        models?: Array<{
          model_id?: string;
          model_name?: string;
          description?: string;
        }>;
      };
      return (parsed.models ?? [])
        .filter((m) => m.model_id)
        .map((m) => ({
          id: m.model_id as string,
          label: m.model_name ?? (m.model_id as string),
          description: m.description,
        }));
    } catch {
      return [];
    }
  }

  async defaultModel(): Promise<string | undefined> {
    try {
      const r = await this.run([
        this.bin,
        "chat",
        "--list-models",
        "--format",
        "json",
      ]);
      if (r.code !== 0) return undefined;
      const parsed = JSON.parse(r.stdout) as { default_model?: string };
      return parsed.default_model ?? "auto";
    } catch {
      return undefined;
    }
  }

  async generate(
    prompt: string,
    opts: { model?: string; signal?: AbortSignal },
  ): Promise<string> {
    const cmd = [this.bin, "chat", "--no-interactive"];
    if (opts.model) cmd.push("--model", opts.model);
    cmd.push(prompt);
    const r = await this.run(cmd, { signal: opts.signal });
    if (r.code !== 0) {
      throw new Error(
        `kiro-cli exited ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`,
      );
    }
    return r.stdout.trim();
  }
}
