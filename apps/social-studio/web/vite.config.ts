import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The contract + seed data live at the repo root (SSOT), outside this package.
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@contracts": `${repoRoot}contracts`,
      "@examples": `${repoRoot}examples`,
      "@i18n": fileURLToPath(new URL("../i18n", import.meta.url)),
    },
  },
  server: { fs: { allow: [repoRoot] } },
  test: { environment: "node" },
});
