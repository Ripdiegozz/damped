import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  // `.e2e.ts` keeps `bun test` (which collects `*.test.ts` and `*.spec.ts`) away from these files.
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The fixtures import the built library and the server serves the built playground, so both are rebuilt before every run.
    command: "bun run build && bun run playground:build && bun e2e/serve.ts",
    url: `http://127.0.0.1:${port}/healthz`,
    env: { E2E_PORT: String(port) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
