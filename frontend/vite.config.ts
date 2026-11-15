/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import getAppVersionDefine from "./getAppVersionDefine.js"; // dev-standardsからsymlink共有
import { resolveVersionFromPackage } from "./appVersion.js";

const pkgUrl = new URL("./package.json", import.meta.url);
// バージョンは「major.minor.mainのコミット数」（正式なバージョン管理の導入までの暫定。appVersion.js参照）
const appVersion = resolveVersionFromPackage(pkgUrl);

// GitHub Pagesのプロジェクトページ（/bird-finder/）配信のため相対baseにする
export default defineConfig({
  base: "./",
  plugins: [react()],
  // symlink共有したコンポーネントがreact等をこのパッケージから解決できるようにする
  resolve: { preserveSymlinks: true },
  define: {
    ...getAppVersionDefine(pkgUrl),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // symlink共有（dev-standards側で管理）・エントリ・型宣言・テスト基盤は対象外
      exclude: ["src/**/*.test.{ts,tsx}", "src/setupTests.ts", "src/main.tsx", "src/vite-env.d.ts", "src/shared/**"],
    },
  },
});
