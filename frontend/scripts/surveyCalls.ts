// 全種について、鳴き声（Commonsの音源）が、画面の検索で見つかるかを調べる（GitHub Actionsで実行する一時の調査。#223）。
// 画面と同じ順（カテゴリ→全文検索。単独らしい録音を先に、最後に疑わしい録音）で探し、どの段で見つかったかを表にする。
// 実行: npx tsx scripts/surveyCalls.ts（結果は、標準出力とREPORTのMarkdown）
import fs from "node:fs";
import { commonsAudioUrl, pickAudio, type CallAudio } from "../src/callAudio.ts";

const UA = "bird-finder-call-survey/1.0 (+https://github.com/uchi-stock/bird-finder)";
const REPORT = process.env.REPORT ?? "call-report.md";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string) {
  for (let i = 0; i < 3; i++) {
    await sleep(300);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      /* 取り直す */
    }
    await sleep(1000 * (i + 1));
  }
  return null;
}

const species = JSON.parse(fs.readFileSync(new URL("../src/data/species.json", import.meta.url), "utf8"));
const steps: [string, "category" | "text", boolean][] = [
  ["カテゴリ（単独らしい）", "category", false],
  ["全文（単独らしい）", "text", false],
  ["カテゴリ（疑わしい）", "category", true],
  ["全文（疑わしい）", "text", true],
];

const rows: string[] = [];
let found = 0;
for (const s of species) {
  let hit: { step: string; audio: CallAudio } | null = null;
  for (const [label, mode, allow] of steps) {
    const json = await get(commonsAudioUrl(s.scientific_name, mode));
    const audio = json ? pickAudio(json, s.scientific_name, mode === "text", allow) : null;
    if (audio) {
      hit = { step: label, audio };
      break;
    }
  }
  if (hit) found++;
  const silent = s.silent ? "（普段鳴かない）" : "";
  console.log(`${s.name_ja}${silent}: ${hit ? `${hit.step} ${hit.audio.title} [${hit.audio.license ?? "?"}]` : "音源なし"}`);
  rows.push(`| ${s.name_ja}${silent} | ${hit ? hit.step : "**音源なし**"} | ${hit ? `[${hit.audio.title}](${hit.audio.pageUrl})` : "—"} | ${hit?.audio.license ?? "—"} |`);
}
fs.writeFileSync(REPORT, ["### 鳴き声の音源の調査", "", `対象 ${species.length} 種 / 見つかる ${found} 種`, "", "| 鳥 | 見つかった段 | 音源 | ライセンス |", "|---|---|---|---|", ...rows].join("\n") + "\n");
