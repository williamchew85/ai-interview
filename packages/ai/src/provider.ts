import type { ModelInfo } from "@interview-copilot/shared";

/**
 * A Provider wraps a local AI CLI. No cloud API keys: adapters shell out to a
 * binary that uses the user's existing login (kiro-cli, claude, cursor-agent).
 */
export interface Provider {
  readonly id: "kiro" | "claude" | "cursor";
  readonly displayName: string;

  /** True when the backing binary is resolvable on this host. */
  isAvailable(): Promise<boolean>;

  /** When unavailable, a short human reason (set after isAvailable()). */
  unavailableReason(): string | undefined;

  /** Models offered; empty when unavailable. Never guessed. */
  listModels(): Promise<ModelInfo[]>;

  /** Default model id when the caller does not specify one. */
  defaultModel(): Promise<string | undefined>;

  /**
   * Run a single prompt and return the full text. (Streaming is layered on top
   * in the server; the adapter contract is one-shot for testability.)
   */
  generate(
    prompt: string,
    opts: { model?: string; signal?: AbortSignal },
  ): Promise<string>;
}

/** Result of running a CLI subprocess. */
export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Minimal subprocess runner, injectable for tests. The default implementation
 * uses Bun.spawn; tests pass a fake to avoid touching the real CLIs.
 */
export type Runner = (
  cmd: string[],
  opts?: { input?: string; signal?: AbortSignal },
) => Promise<RunResult>;

/** Default runner backed by Bun.spawn. */
export const bunRunner: Runner = async (cmd, opts) => {
  const proc = Bun.spawn(cmd, {
    stdin: opts?.input ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (opts?.input) {
    proc.stdin?.write(opts.input);
    proc.stdin?.end();
  }
  if (opts?.signal) {
    opts.signal.addEventListener("abort", () => proc.kill(), { once: true });
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
};

/** Resolve whether a binary exists on PATH (cross-platform best-effort). */
export async function binaryExists(
  bin: string,
  run: Runner = bunRunner,
): Promise<boolean> {
  const probe =
    process.platform === "win32"
      ? ["where", bin]
      : ["sh", "-c", `command -v ${bin}`];
  try {
    const r = await run(probe);
    return r.code === 0 && r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}
