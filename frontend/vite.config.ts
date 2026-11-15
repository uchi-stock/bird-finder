/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pagesのプロジェクトページ（/bird-finder/）配信のため相対baseにする
export default defineConfig({
  base: "./",
  plugins: [react()],
});
