import type { TranscriptLine, Speaker } from "@interview-copilot/shared";

/**
 * Captions re-render: a line appears as interim text, grows, then finalizes.
 * This buffer keeps one evolving line per (speaker, key) until it is final,
 * then freezes it. De-dups identical consecutive finals.
 */
export class TranscriptBuffer {
  private lines: TranscriptLine[] = [];
  /** Keyed active (non-final) line per speaker+caption-key. */
  private active = new Map<string, number>(); // key -> index into lines

  private keyOf(speaker: Speaker, speakerName?: string): string {
    return `${speaker}:${speakerName ?? ""}`;
  }

  /** Feed an observed caption (interim or final). Returns the current snapshot. */
  push(input: {
    speaker: Speaker;
    speakerName?: string;
    text: string;
    final: boolean;
  }): TranscriptLine[] {
    const text = input.text.trim();
    if (!text) return this.snapshot();
    const key = this.keyOf(input.speaker, input.speakerName);
    const existingIdx = this.active.get(key);

    if (existingIdx !== undefined && this.lines[existingIdx]) {
      // Update the evolving line in place.
      const line = this.lines[existingIdx]!;
      line.text = text;
      line.final = input.final;
      line.ts = Date.now();
      if (input.final) this.active.delete(key);
      return this.snapshot();
    }

    // No active line for this key. Avoid duplicating the last final line.
    const last = this.lines[this.lines.length - 1];
    if (last && last.final && last.text === text && last.speaker === input.speaker) {
      return this.snapshot();
    }

    const line: TranscriptLine = {
      id: `c_${Date.now()}_${this.lines.length}`,
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

  /** Recent lines, newest last, capped. */
  recent(n = 40): TranscriptLine[] {
    return this.lines.slice(-n);
  }

  clear(): void {
    this.lines = [];
    this.active.clear();
  }
}
