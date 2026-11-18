import { defineConfig, devices } from "@playwright/test";

const workers = process.env.RECALLIO_E2E_RUNTIME === "workers";
const port = workers ? 3211 : 3210;
const url = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: url, headless: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: workers
      ? `npm run workers:preview -- --ip 127.0.0.1 --port ${port}`
      : `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `${url}/api/health`,
    reuseExistingServer: false,
  },
});
