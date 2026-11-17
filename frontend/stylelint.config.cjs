"use strict";

// ルートの共有設定（dev-standardsからのsymlink）を使う。extendsの解決をfrontendのnode_modulesから行うため、ここで読み込む。
// 無効にしているルールは無い（#85で、重複したセレクタの統合と並べ替えを終え、すべて有効にした）
module.exports = require("../stylelint.config.cjs");
