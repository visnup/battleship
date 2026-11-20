import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.spec.ts", // *.test.ts are node --test's
  use: {
    baseURL: "http://localhost:3020",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "next dev -p 3020",
    url: "http://localhost:3020",
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
