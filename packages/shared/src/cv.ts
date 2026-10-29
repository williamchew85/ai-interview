/**
 * Phase 22.1 — pure CV/resume text normaliser. Format-specific extraction
 * (.pdf / .docx) lives in the web app because it touches File/DOM; this module
 * is the framework-free cleanup that every extractor funnels through, so the
 * normalised text is consistent and unit-testable without a browser.
 *
 * Output lands in RoleContext.background and flows through the existing prompt
 * pipeline (contextBlock in packages/ai) — no new assist path.
 */

/** Max characters kept, so a long CV cannot blow the prompt budget. */
export const CV_MAX_CHARS = 8000;

export interface NormaliseCvOptions {
  /** Override the length cap (default CV_MAX_CHARS). */
  maxChars?: number;
}

/**
 * Normalise raw extracted CV text:
 *  - CRLF/CR -> LF;
 *  - common bullet glyphs (•, ‣, ·, –, —, *) at line start -> "- ";
 *  - collapse runs of spaces/tabs; trim each line;
 *  - drop blank-line runs to at most one;
 *  - drop obvious page-number / "Page x of y" noise lines;
 *  - cap length (cut on a line boundary when possible).
 */
export function normaliseCvText(raw: string, opts: NormaliseCvOptions = {}): string {
  const maxChars = opts.maxChars ?? CV_MAX_CHARS;
  if (!raw) return "";

  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let blankRun = 0;

  for (const rawLine of lines) {
    let line = rawLine.replace(/[ \t]+/g, " ").trim();

    if (line === "") {
      blankRun++;
      if (blankRun <= 1) out.push("");
      continue;
    }
    blankRun = 0;

    // Drop page-number noise: "1", "Page 2", "Page 2 of 5", "- 3 -".
    if (/^-?\s*\d{1,3}\s*-?$/.test(line) || /^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) {
      continue;
    }

    // Normalise a leading bullet glyph to "- ".
    line = line.replace(/^[\u2022\u2023\u00B7\u2043\u2013\u2014*]\s*/, "- ");

    out.push(line);
  }

  // Trim leading/trailing blank lines.
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();

  let text = out.join("\n");
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars);
    const lastNl = cut.lastIndexOf("\n");
    text = (lastNl > maxChars * 0.6 ? cut.slice(0, lastNl) : cut).trimEnd();
  }
  return text;
}

/**
 * Best-effort guess at the role/title from the top of a CV, to optionally
 * prefill RoleContext.jobOrRole. Returns the first short, title-like line in the
 * first few lines (not an email/phone/URL, not a bullet). Undefined if none fit.
 */
export function guessRoleTitle(normalised: string): string | undefined {
  const lines = normalised.split("\n").filter((l) => l.trim()).slice(0, 6);
  for (const l of lines) {
    const t = l.trim();
    if (t.length < 3 || t.length > 60) continue;
    if (t.startsWith("- ")) continue;
    if (/@|https?:\/\/|\+?\d[\d ()-]{6,}/.test(t)) continue; // email / url / phone
    if (/[.!?]$/.test(t)) continue; // sentence, not a title
    return t;
  }
  return undefined;
}
