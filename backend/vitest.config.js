import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      // dev-standardsからコピーして共有している部品は、dev-standards側でテストされるため対象外
      exclude: ["src/**/*.test.js", "src/shared/**"],
    },
  },
});
