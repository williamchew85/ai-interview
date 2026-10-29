import { defineConfig } from "vite";
import { resolve } from "node:path";

const dir = import.meta.dirname;

/**
 * MV3 build: content.js (injected into meeting pages) and service-worker.js.
 * public/ (manifest, icons) is copied verbatim into dist/.
 * root is pinned to this app so outDir and publicDir resolve here, not at the
 * monorepo root.
 */
export default defineConfig({
  root: dir,
  resolve: {
    alias: {
      "@interview-copilot/shared": resolve(dir, "../../packages/shared/src/index.ts"),
      "@interview-copilot/stt": resolve(dir, "../../packages/stt/src/index.ts"),
    },
  },
  publicDir: resolve(dir, "public"),
  build: {
    outDir: resolve(dir, "dist"),
    emptyOutDir: true,
    target: "chrome116",
    rollupOptions: {
      input: {
        content: resolve(dir, "src/content.ts"),
        "service-worker": resolve(dir, "src/service-worker.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
  },
});
