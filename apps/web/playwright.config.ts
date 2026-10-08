import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a production build (`pnpm build` first), with
// Postgres and Mailpit running (`docker compose up -d`). Locally the server
// reads the repo-root .env; in CI the job sets the variables.
const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  // One shared database and mailbox: keep it simple and serial.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}/en/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
