import type { AssistRequest, Suggestion } from "@interview-copilot/shared";
import {
  ProviderRegistry,
  fallbackForRequest,
  buildPrompt,
  wasQuestionJustAsked,
  buildCodingPrompt,
  type CodingRequest,
} from "@interview-copilot/ai";
import type { Runner } from "@interview-copilot/ai";

/**
 * Builds the HTTP request handler (Bun.serve compatible). A Runner can be
 * injected for tests so routes exercise without real CLIs.
 *
 * Routes:
 *   GET  /api/health
 *   GET  /api/providers
 *   POST /api/assist          -> one-shot Suggestion JSON
 *   POST /api/assist/stream   -> text/event-stream of the suggestion (D1)
 *   POST /api/question-asked  -> { asked: boolean } heuristic (Phase 5.3)
 */
export function createApp(opts: { runner?: Runner } = {}) {
  const registry = new ProviderRegistry(opts.runner);

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  /** Core: produce suggestion text, degrading to the deterministic suggester. */
  async function produce(
    body: AssistRequest,
    signal?: AbortSignal,
  ): Promise<{ text: string; fallback: boolean }> {
    const provider = registry.get(body.provider);
    if (body.forceFallback || !provider) {
      return { text: fallbackForRequest(body), fallback: true };
    }
    if (!(await provider.isAvailable())) {
      return { text: fallbackForRequest(body), fallback: true };
    }
    try {
      const text = await provider.generate(buildPrompt(body), {
        model: body.model,
        signal,
      });
      // An empty CLI reply is treated as a soft failure.
      if (!text.trim()) return { text: fallbackForRequest(body), fallback: true };
      return { text, fallback: false };
    } catch {
      return { text: fallbackForRequest(body), fallback: true };
    }
  }

  async function parseAssist(req: Request): Promise<AssistRequest | Response> {
    let body: AssistRequest;
    try {
      body = (await req.json()) as AssistRequest;
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    if (body.mode !== "interviewer" && body.mode !== "interviewee") {
      return json({ error: "mode must be interviewer|interviewee" }, 400);
    }
    if (!Array.isArray(body.transcript)) {
      return json({ error: "transcript must be an array" }, 400);
    }
    return body;
  }

  async function handleAssist(req: Request): Promise<Response> {
    const parsed = await parseAssist(req);
    if (parsed instanceof Response) return parsed;
    const body = parsed;
    const { text, fallback } = await produce(body, req.signal);
    const now = Date.now();
    const sug: Suggestion = {
      id: `s_${now}`,
      mode: body.mode,
      ts: now,
      text,
      provider: body.provider,
      model: body.model,
      fallback,
    };
    return json(sug);
  }

  /** SSE stream (D1): the completed text is chunked so the UI renders progressively. */
  async function handleAssistStream(req: Request): Promise<Response> {
    const parsed = await parseAssist(req);
    if (parsed instanceof Response) return parsed;
    const body = parsed;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: string, data: unknown) =>
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        try {
          const { text, fallback } = await produce(body, req.signal);
          send("meta", { provider: body.provider, model: body.model, fallback });
          // Chunk by line (suggestions are short); keeps a cancel point per chunk.
          for (const line of text.split("\n")) {
            if (req.signal?.aborted) break;
            send("chunk", { text: line + "\n" });
          }
          send("done", { ok: true });
        } catch (e) {
          send("error", { message: (e as Error).message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  async function handleQuestionAsked(req: Request): Promise<Response> {
    const parsed = await parseAssist(req);
    if (parsed instanceof Response) return parsed;
    return json({ asked: wasQuestionJustAsked(parsed.transcript) });
  }

  /** Phase 18 — coding assist. Body: { provider, model, language, problem?, code?, screenshots? }. */
  async function handleCoding(req: Request): Promise<Response> {
    let body: CodingRequest & { provider?: string; model?: string };
    try {
      body = (await req.json()) as CodingRequest & { provider?: string; model?: string };
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    if (!body.language) return json({ error: "language required" }, 400);
    const now = Date.now();
    const provider = registry.get((body.provider ?? "kiro") as "kiro" | "claude" | "cursor");
    const prompt = buildCodingPrompt(body);
    if (!provider || !(await provider.isAvailable())) {
      return json({ id: `c_${now}`, text: "// No provider available — start a CLI (kiro-cli/claude).", fallback: true, ts: now });
    }
    try {
      const text = await provider.generate(prompt, { model: body.model, signal: req.signal });
      return json({ id: `c_${now}`, text, fallback: false, ts: now });
    } catch {
      return json({ id: `c_${now}`, text: "// Coding assist failed — the provider errored.", fallback: true, ts: now });
    }
  }

  async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ service: "interview-copilot", ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/providers") {
      return json(await registry.describe());
    }
    if (req.method === "POST" && url.pathname === "/api/assist") {
      return handleAssist(req);
    }
    if (req.method === "POST" && url.pathname === "/api/assist/stream") {
      return handleAssistStream(req);
    }
    if (req.method === "POST" && url.pathname === "/api/question-asked") {
      return handleQuestionAsked(req);
    }
    if (req.method === "POST" && url.pathname === "/api/coding") {
      return handleCoding(req);
    }
    return json({ error: "not found" }, 404);
  }

  return { fetch: fetchHandler, registry };
}
