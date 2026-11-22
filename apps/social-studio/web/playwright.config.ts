import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL set (e.g. docker compose → http://web:8080): test that server.
// Otherwise build the app and serve it locally with `vite preview`.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: external ?? "http://localhost:4173",
    viewport: { width: 1440, height: 900 },
    locale: "de-DE",
    trace: "off",
  },
  webServer: external
    ? undefined
    : { command: "npm run build && npx vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: true, timeout: 180_000 },
});
