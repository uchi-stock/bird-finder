import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// 現段階は最小構成（推奨ルール＋フックの依存配列）。複雑度などの厳格化はフェーズ3で見直す（CLAUDE.md参照）
export default tseslint.config(
  { ignores: ["dist", "coverage", "src/shared/**", "src/components/ServiceWorkerRegistration.jsx", "public/sw.js", "getAppVersionDefine.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" }],
    },
  },
);
