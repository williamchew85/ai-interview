import { normaliseCvText } from "@interview-copilot/shared";

/**
 * Phase 22.2 — extract plain text from an uploaded CV, then normalise it.
 * Format-specific because it touches File/DOM (so it lives in the web app, not
 * the pure shared package).
 *
 * PDF/DOCX parsers (`pdfjs-dist`, `mammoth`) are OPTIONAL deps, resolved at
 * RUNTIME through a variable specifier so the build never hard-depends on them:
 * a user who only uploads .txt/.md needs nothing extra, and when a parser is not
 * installed the upload degrades to a clear CvParseError instead of a build break.
 * Install them with `bun add pdfjs-dist mammoth` in apps/web to enable PDF/DOCX.
 */

export const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB

export class CvParseError extends Error {}

/** Runtime dynamic import that TypeScript/Vite will not try to resolve statically. */
async function loadOptional(name: string): Promise<unknown> {
  const spec = name; // indirection keeps the specifier non-literal
  return import(/* @vite-ignore */ spec);
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

interface PdfjsLike {
  GlobalWorkerOptions?: { workerSrc: string };
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useWorkerFetch?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }>;
    }>;
  };
}
interface MammothLike {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}

async function extractPdf(file: File): Promise<string> {
  let pdfjs: PdfjsLike;
  try {
    pdfjs = (await loadOptional("pdfjs-dist")) as PdfjsLike;
  } catch {
    throw new CvParseError("PDF support needs the 'pdfjs-dist' package (bun add pdfjs-dist). Paste the text or upload a .txt instead.");
  }
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = ""; // inline, no separate worker file
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useWorkerFetch: false }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    parts.push(content.items.map((it) => it.str ?? "").join(" "));
  }
  return parts.join("\n");
}

async function extractDocx(file: File): Promise<string> {
  let mammoth: MammothLike;
  try {
    mammoth = (await loadOptional("mammoth")) as MammothLike;
  } catch {
    throw new CvParseError("DOCX support needs the 'mammoth' package (bun add mammoth). Paste the text or upload a .txt instead.");
  }
  const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return res.value;
}

/**
 * Extract and normalise text from a CV file. Returns the cleaned background
 * text ready to drop into RoleContext.background.
 */
export async function extractCvText(file: File): Promise<string> {
  if (file.size > MAX_CV_BYTES) {
    throw new CvParseError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max 5 MB).`);
  }
  const kind = ext(file.name);
  let raw: string;
  switch (kind) {
    case "txt":
    case "md":
    case "markdown":
      raw = await file.text();
      break;
    case "pdf":
      raw = await extractPdf(file);
      break;
    case "docx":
      raw = await extractDocx(file);
      break;
    default:
      throw new CvParseError(`Unsupported file type ".${kind}". Upload a .pdf, .docx, .txt or .md.`);
  }
  const text = normaliseCvText(raw);
  if (!text.trim()) {
    throw new CvParseError("No readable text found in that file (a scanned-image PDF has no text layer).");
  }
  return text;
}
