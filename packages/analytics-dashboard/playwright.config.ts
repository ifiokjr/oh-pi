import { defineConfig, devices } from "@playwright/test";

// Playwright configuration for Pi Analytics Dashboard E2E tests
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Sequential to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: "list",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:31415",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npx vite --port 31415",
    url: "http://localhost:31415",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});