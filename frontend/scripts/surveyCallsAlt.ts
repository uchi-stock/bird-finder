// 音源が見つからない鳥を、旧学名・英名でも探し直す一時の調査（GitHub Actionsで実行する。#223）。結果は、Job Summaryの表。
import fs from "node:fs";
import { commonsAudioUrl, pickAudio } from "../src/callAudio.ts";

const UA = "bird-finder-call-survey/1.0 (+https://github.com/uchi-stock/bird-finder)";
const REPORT = process.env.REPORT ?? "call-alt-report.md";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 学名・英名の別名（Commonsの題名は、旧学名や英名のことがある）
const ALT: Record<string, string[]> = {
  "Spodiopsar cineraceus": ["Sturnus cineraceus", "White-cheeked Starling", "Grey Starling"],
  "Motacilla grandis": ["Japanese Wagtail"],
  "Chloris sinica": ["Carduelis sinica", "Oriental Greenfinch"],
  "Turdus eunomus": ["Turdus naumanni", "Dusky Thrush", "Naumann's Thrush"],
  "Lanius bucephalus": ["Bull-headed Shrike"],
  "Emberiza cioides": ["Meadow Bunting"],
  "Emberiza spodocephala": ["Black-faced Bunting"],
  "Phoenicurus auroreus": ["Daurian Redstart"],
  "Anas zonorhyncha": ["Anas poecilorhyncha", "Eastern Spot-billed Duck", "Spot-billed Duck"],
  "Garrulax canorus": ["Pterorhinus canorus", "Leiothrix canorus", "Hwamei", "Chinese Hwamei"],
};

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

const rows: string[] = [];
for (const [sci, alts] of Object.entries(ALT)) {
  const found: string[] = [];
  for (const name of alts) {
    for (const mode of ["category", "text"] as const) {
      const json = await get(commonsAudioUrl(name, mode));
      // 題名の照合は、別名のどれかを含むものに緩める（別の鳥の音源を避けるため、全文検索は題名に別名を含むものに限る）
      const a = json ? pickAudio(json, name, mode === "text", true) : null;
      if (a) found.push(`${name}（${mode}）: [${a.title}](${a.pageUrl}) ${a.license ?? "?"}`);
    }
  }
  console.log(`${sci}: ${found.length ? found.join(" / ") : "なし"}`);
  rows.push(`| ${sci} | ${found.length ? found.join("<br>") : "**なし**"} |`);
}
fs.writeFileSync(REPORT, ["### 鳴き声の音源（別名での再検索）", "", "| 学名 | 見つかった音源 |", "|---|---|", ...rows].join("\n") + "\n");
