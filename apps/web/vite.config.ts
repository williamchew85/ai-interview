import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const dir = import.meta.dirname;

export default defineConfig({
  root: dir,
  plugins: [react()],
  resolve: {
    alias: {
      "@interview-copilot/shared": resolve(dir, "../../packages/shared/src/index.ts"),
      "@interview-copilot/stt": resolve(dir, "../../packages/stt/src/index.ts"),
    },
  },
  server: { host: "127.0.0.1", port: 8790 },
  build: { outDir: resolve(dir, "dist"), emptyOutDir: true },
});
