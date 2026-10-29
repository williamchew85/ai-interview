/**
 * Phase 16.1/16.2 — parse an AI answer into renderable blocks so the widget
 * and web both render bullets, code blocks and mermaid diagrams consistently.
 * Framework-free + pure, so it is unit-testable.
 */

export type AnswerBlock =
  | { kind: "text"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "code"; lang: string; code: string }
  | { kind: "mermaid"; code: string };

const FENCE = /^```(\w*)\s*$/;

export function parseAnswer(raw: string): AnswerBlock[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: AnswerBlock[] = [];
  let i = 0;

  const flushText = (buf: string[]) => {
    const text = buf.join("\n").trim();
    if (text) blocks.push({ kind: "text", text });
  };
  const flushBullets = (buf: string[]) => {
    if (buf.length) blocks.push({ kind: "bullets", items: buf.slice() });
  };

  let textBuf: string[] = [];
  let bulletBuf: string[] = [];

  while (i < lines.length) {
    const line = lines[i]!;
    const fence = line.match(FENCE);

    if (fence) {
      // close any open text/bullets, then consume the fenced block.
      flushText(textBuf); textBuf = [];
      flushBullets(bulletBuf); bulletBuf = [];
      const lang = (fence[1] || "").toLowerCase();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i]!)) {
        code.push(lines[i]!);
        i++;
      }
      i++; // skip closing fence
      const body = code.join("\n");
      if (lang === "mermaid") blocks.push({ kind: "mermaid", code: body });
      else blocks.push({ kind: "code", lang: lang || "text", code: body });
      continue;
    }

    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      flushText(textBuf); textBuf = [];
      bulletBuf.push(bullet[1]!.trim());
      i++;
      continue;
    }

    // Non-bullet, non-fence line: a blank line closes a bullet list.
    if (line.trim() === "") {
      flushBullets(bulletBuf); bulletBuf = [];
      textBuf.push(line);
    } else {
      flushBullets(bulletBuf); bulletBuf = [];
      textBuf.push(line);
    }
    i++;
  }
  flushText(textBuf);
  flushBullets(bulletBuf);
  return blocks;
}
