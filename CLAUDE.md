@dev-standards/CLAUDE.md

# bird-finder 固有のメモ

- 目的: 「声しか知らない鳥」を、鳴き声のオノマトペ・外見・行動・場所・季節から探す野鳥図鑑の試作（フェーズ2）
- 構成: `frontend/`（Vite + React + TypeScript）と、共有地図のためだけのバックエンド`backend/`（AWS）。ログインなし。配信はGitHub Pages
- 判定ロジック: `frontend/src/domain/scoring.ts`（UI非依存の純粋関数）。鳥種データ: `frontend/src/data/species.json`
- 未入力は加点も減点もしない。スコアは確率として表示しない
- lintは最小構成（ESLint推奨ルール＋フックの依存配列、`--max-warnings 0`）。複雑度などの厳格化は、方向性が固まった段階（フェーズ3）で見直す。カバレッジ閾値は85
