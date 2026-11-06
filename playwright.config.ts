import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "browser.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    launchOptions: process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : undefined,
  },
});
