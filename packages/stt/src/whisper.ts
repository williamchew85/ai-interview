import type { TranscriptLine } from "@interview-copilot/shared";

/**
 * Phase 9 (= Phase 20.4) — local-Whisper transcription, built ONCE here and
 * consumed by BOTH the server route (non-Chrome browsers / privacy / remote
 * speaker) and the Electron overlay's loopback capture. No cloud STT.
 *
 * It shells out to a local Whisper binary (OpenAI `whisper` CLI or
 * `whisper.cpp`'s `main`/`whisper-cli`) over a finished audio file. We do NOT
 * stream raw audio frames here — the caller records a chunk to a WAV and passes
 * the path; this keeps the transcriber a pure, testable function with an
 * injectable runner (mirrors the AI package's Runner pattern).
 */

/** Result of running a subprocess. */
export interface WhisperRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Injectable subprocess runner (tests pass a fake; prod uses Bun.spawn). */
export type WhisperRunner = (cmd: string[]) => Promise<WhisperRunResult>;

export interface WhisperOptions {
  /** Binary to invoke. Default: "whisper" (the OpenAI CLI). */
  binary?: string;
  /** Model name/path (e.g. "base.en", or a .bin for whisper.cpp). */
  model?: string;
  /** Spoken language hint (e.g. "en"); omit for auto-detect. */
  language?: string;
  /** Speaker tag applied to produced lines. Default "unknown". */
  speaker?: TranscriptLine["speaker"];
}

/** A line of recognised speech (plain, before TranscriptLine shaping). */
export interface WhisperSegment {
  text: string;
}

/**
 * Parse Whisper CLI stdout into text segments. Handles two common shapes:
 *  - `--output_format txt` / plain text: one utterance per non-empty line.
 *  - timestamped lines `[00:00.000 --> 00:02.000]  text` (whisper.cpp / verbose).
 * Blank and bracket-only lines are dropped.
 */
export function parseWhisperOutput(stdout: string): WhisperSegment[] {
  const segs: WhisperSegment[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Strip a leading "[..] " timestamp marker if present.
    const m = line.match(/^\[[^\]]*\]\s*(.*)$/);
    const text = (m ? m[1] : line).trim();
    if (!text) continue;
    segs.push({ text });
  }
  return segs;
}

/** Build the Whisper CLI argv for a WAV path + options. */
export function whisperArgv(wavPath: string, opts: WhisperOptions = {}): string[] {
  const bin = opts.binary ?? "whisper";
  const argv = [bin, wavPath, "--output_format", "txt"];
  if (opts.model) argv.push("--model", opts.model);
  if (opts.language) argv.push("--language", opts.language);
  return argv;
}

export class WhisperTranscriber {
  readonly id = "whisper";
  constructor(private run: WhisperRunner, private opts: WhisperOptions = {}) {}

  /** True when the Whisper binary resolves on PATH. */
  async isAvailable(): Promise<boolean> {
    const bin = this.opts.binary ?? "whisper";
    const probe = process.platform === "win32" ? ["where", bin] : ["sh", "-c", `command -v ${bin}`];
    try {
      const r = await this.run(probe);
      return r.code === 0 && r.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /** Transcribe a finished WAV file into transcript lines. */
  async transcribeFile(wavPath: string): Promise<TranscriptLine[]> {
    const r = await this.run(whisperArgv(wavPath, this.opts));
    if (r.code !== 0) {
      throw new Error(`whisper exited ${r.code}: ${r.stderr.slice(0, 200)}`);
    }
    const speaker = this.opts.speaker ?? "unknown";
    const base = Date.now();
    return parseWhisperOutput(r.stdout).map((seg, i) => ({
      id: `wh_${base}_${i}`,
      speaker,
      text: seg.text,
      final: true,
      ts: base + i,
    }));
  }
}
