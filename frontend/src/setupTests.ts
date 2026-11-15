import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// Node 22+ はフラグなしの localStorage グローバルを提供するが、--localstorage-file 未指定だと
// getItem/setItem が機能せず jsdom の実装を覆ってしまう。メモリ上で動作する実装を補完する
if (typeof globalThis.localStorage?.setItem !== "function") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

// jsdom に無い値（vite.config.ts の define で埋め込まれる）
(globalThis as Record<string, unknown>).__APP_VERSION__ = "0.0.0-test";
(globalThis as Record<string, unknown>).__APP_BUILD_TIME__ = "2026-01-01T00:00:00.000Z";
