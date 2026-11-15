/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import getAppVersionDefine from "./getAppVersionDefine.js"; // dev-standardsからsymlink共有

// GitHub Pagesのプロジェクトページ（/bird-finder/）配信のため相対baseにする
export default defineConfig({
  base: "./",
  plugins: [react()],
  // symlink共有したコンポーネントがreact等をこのパッケージから解決できるようにする
  resolve: { preserveSymlinks: true },
  define: {
    ...getAppVersionDefine(new URL("./package.json", import.meta.url)),
  },
});
