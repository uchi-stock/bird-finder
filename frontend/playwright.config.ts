import { defineConfig, devices } from "@playwright/test";

// スマホ幅のE2E。ビルド済みのアプリ（vite preview）に対して実行する。外部への通信はテスト側ですべてモックする
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "off" },
  webServer: { command: "npx vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
