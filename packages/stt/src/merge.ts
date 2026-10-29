import type { TranscriptLine, Speaker } from "@interview-copilot/shared";

/**
 * Phase 3.4 — transcript merge/order buffer shared by the standalone call mode
 * (mic STT + data-channel finals) and the overlay caption path. Keeps one
 * evolving interim line per (speaker, key) until it finalizes, then freezes it;
 * drops a duplicate consecutive final from the same speaker.
 */
export class TranscriptMerger {
  private lines: TranscriptLine[] = [];
  private active = new Map<string, number>();

  private keyOf(speaker: Speaker, speakerName?: string): string {
    return `${speaker}:${speakerName ?? ""}`;
  }

  push(input: {
    speaker: Speaker;
    speakerName?: string;
    text: string;
    final: boolean;
  }): TranscriptLine[] {
    const text = input.text.trim();
    if (!text) return this.snapshot();
    const key = this.keyOf(input.speaker, input.speakerName);
    const idx = this.active.get(key);

    if (idx !== undefined && this.lines[idx]) {
      const line = this.lines[idx]!;
      line.text = text;
      line.final = input.final;
      line.ts = Date.now();
      if (input.final) this.active.delete(key);
      return this.snapshot();
    }

    const last = this.lines[this.lines.length - 1];
    if (last && last.final && last.text === text && last.speaker === input.speaker) {
      return this.snapshot();
    }

    const line: TranscriptLine = {
      id: `t_${Date.now()}_${this.lines.length}`,
      speaker: input.speaker,
      speakerName: input.speakerName,
      text,
      final: input.final,
      ts: Date.now(),
    };
    this.lines.push(line);
    if (!input.final) this.active.set(key, this.lines.length - 1);
    return this.snapshot();
  }

  snapshot(): TranscriptLine[] {
    return this.lines.slice();
  }

  recent(n = 40): TranscriptLine[] {
    return this.lines.slice(-n);
  }

  clear(): void {
    this.lines = [];
    this.active.clear();
  }
}
