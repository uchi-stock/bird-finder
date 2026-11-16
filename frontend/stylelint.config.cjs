"use strict";

// ルートの共有設定（dev-standardsからのsymlink）を使う。extendsの解決をfrontendのnode_modulesから行うため、ここで読み込む。
// 次の2ルールは、同じセレクタを複数か所に分けて書いた既存のCSSが多数あり、
// 統合するとcascadeの順序が変わって見た目が崩れうるため、いったん無効にしている。
// スクリーンショットで前後を比べながら統合するフォローアップのIssueで有効に戻す
const shared = require("../stylelint.config.cjs");

module.exports = {
  ...shared,
  rules: {
    ...shared.rules,
    "no-duplicate-selectors": null,
    "no-descending-specificity": null,
  },
};
