@dev-standards/CLAUDE.md

# bird-finder 固有のメモ

- 目的: 「声しか知らない鳥」を、鳴き声のオノマトペ・外見・行動・場所・季節から探す野鳥図鑑の試作（フェーズ2）
- 構成: `frontend/`（Vite + React + TypeScript）のみ。ログイン・バックエンドなし。配信はGitHub Pages
- 判定ロジック: `frontend/src/domain/scoring.ts`（UI非依存の純粋関数）。鳥種データ: `frontend/src/data/species.json`
- 未入力は加点も減点もしない。スコアは確率として表示しない
- 現段階ではlint厳格化・カバレッジ閾値は設定しない。方向性が固まった段階（フェーズ3）で見直す
