import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 8791);
const app = createApp();

Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});

console.log(`[interview-copilot] server on http://127.0.0.1:${port}`);
