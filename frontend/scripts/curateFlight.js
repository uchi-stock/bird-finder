// 飛翔の画像が見つからない鳥に、画像分類（CLIP）で選んだ「飛んでいる写真」を、固定して補う（GitHub Actionsで実行する。
// 手元・サンドボックスからは、WikimediaとHugging Faceへ届かない）。#212
// 画面は、題名に飛翔を示す語を含む画像だけを探す。題名にその語が無い写真しかない鳥は、飛ぶ姿が出ない。
// そこで、そうした鳥について、Commonsの候補を広く集め（学名＋flying・flight、学名のカテゴリ）、画像分類で飛んでいる写真を選び、
// src/data/flightPhotos.json（学名をキーにした表）へ書く。画面と検出workflowは、検索より先に、この表を使う。
//
// 環境変数: SPECIES_IDS（任意。カンマ区切り。指定した鳥だけ処理し、他は今のflightPhotos.jsonのまま残す）
//           REPORT（任意。結果の表（Markdown）の出力先。既定 flight-report.md）
// 実行: node scripts/curateFlight.js（Node 24。TypeScriptの共通ロジックを、そのまま読み込む）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commonsFlightUrl, pickFlightPhoto } from "../src/domain/flightPhoto.ts";
import { filterFlightCandidates, pickFlight, toEntry } from "./flightScore.js";
import { binaryFlyingScore, BINARY_LABELS, flyingScore, isFlying, POSE_LABELS } from "./poseScore.js";
import { isUnsuitable, QUALITY_LABELS, scoreOf } from "./qualityScore.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SPECIES_FILE = path.resolve(here, "../src/data/species.json");
const FLIGHT_FILE = path.resolve(here, "../src/data/flightPhotos.json");
const REPORT = process.env.REPORT ?? "flight-report.md";
const UA = "bird-finder-flight-curation/1.0 (+https://github.com/uchi-stock/bird-finder)";
const DELAY_MS = 300;
const MAX_CANDIDATES = 30;
const MAX_FAILURES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    await sleep(DELAY_MS);
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

function searchUrl(query) {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "50",
    gsrsearch: query,
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "500",
  });
  return `https://commons.wikimedia.org/w/api.php?${q.toString()}`;
}

/** 学名から、候補を集める検索。飛翔の語つきの検索と、学名のカテゴリ（Commonsの「Category:学名」）の画像 */
const queriesFor = (sci) => [`"${sci}" flying`, `"${sci}" flight`, `"${sci}" "taking off"`, `"${sci}" wings`, `incategory:"${sci}" filetype:bitmap`];

async function main() {
  const { pipeline, RawImage } = await import("@huggingface/transformers");
  const clf = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32");
  const measure = async (c) => {
    try {
      const res = await fetch(c.thumbnail, { headers: { "User-Agent": UA } });
      if (!res.ok) return null;
      const image = await RawImage.fromBlob(new Blob([await res.arrayBuffer()]));
      const pose = { three: await clf(image, Object.values(POSE_LABELS)), binary: await clf(image, Object.values(BINARY_LABELS)) };
      const quality = {};
      for (const [k, labels] of Object.entries(QUALITY_LABELS)) quality[k] = await clf(image, labels);
      const q = { photo: scoreOf(quality.photo, QUALITY_LABELS.photo[0]), animal: scoreOf(quality.animal, QUALITY_LABELS.animal[0]), prey: scoreOf(quality.prey, QUALITY_LABELS.prey[0]) };
      const score = Math.max(flyingScore(pose.three) ?? 0, binaryFlyingScore(pose.binary) ?? 0);
      return { ...c, flying: isFlying(pose), score, unsuitable: isUnsuitable(q) };
    } catch {
      await sleep(500);
      return null;
    }
  };

  const species = JSON.parse(fs.readFileSync(SPECIES_FILE, "utf8"));
  const only = (process.env.SPECIES_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const targets = only.length ? species.filter((s) => only.includes(s.species_id)) : species;
  const table = fs.existsSync(FLIGHT_FILE) ? JSON.parse(fs.readFileSync(FLIGHT_FILE, "utf8")) : {};
  const rows = [];
  let failed = 0;

  for (const s of targets) {
    // すでに、画面の検索で見つかる鳥・固定済みの鳥は、対象外
    if (table[s.scientific_name]) {
      rows.push({ s, note: "固定済み", entry: table[s.scientific_name] });
      continue;
    }
    const live = await get(commonsFlightUrl(s.scientific_name));
    if (live && pickFlightPhoto(live)) {
      rows.push({ s, note: "検索で見つかる（対象外）" });
      continue;
    }
    // 候補を集める
    const pages = {};
    let anyOk = false;
    for (const query of queriesFor(s.scientific_name)) {
      const r = await get(searchUrl(query));
      if (r) anyOk = true;
      Object.assign(pages, r?.query?.pages ?? {});
    }
    if (!anyOk) {
      failed++;
      rows.push({ s, note: "検索に失敗（今のまま）" });
      continue;
    }
    const candidates = filterFlightCandidates(pages).slice(0, MAX_CANDIDATES);
    const measured = [];
    for (const c of candidates) {
      const m = await measure(c);
      if (m) measured.push(m);
    }
    const best = pickFlight(measured);
    if (best) table[s.scientific_name] = toEntry(best);
    rows.push({ s, note: best ? "選んだ" : "飛んでいる写真が見つからない", entry: best ? toEntry(best) : null, best, count: measured.length, flyingCount: measured.filter((m) => m.flying).length });
    console.log(`${s.name_ja}: 候補${measured.length}件（飛ぶ ${measured.filter((m) => m.flying).length}件）→ ${best ? `選んだ ${best.title}（確度 ${best.score.toFixed(2)}）` : "見つからない"}`);
  }

  const f = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
  const img = (u) => (u ? `<img src="${u}" width="110">` : "—");
  const lines = [
    "### 飛翔の画像の選び直し（画像分類）",
    "",
    `対象 ${rows.length} 種 / 選んだ ${rows.filter((r) => r.note === "選んだ").length} 種 / 見つからない ${rows.filter((r) => r.note === "飛んでいる写真が見つからない").length} 種 / 検索に失敗 ${failed} 種`,
    "",
    "| 鳥 | 結果 | 選んだ画像 | 確度 | 候補数（うち飛ぶ） |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.s.name_ja} | ${r.note} | ${img(r.entry?.thumbnail)} | ${f(r.best?.score)} | ${r.count ?? "—"}（${r.flyingCount ?? "—"}） |`),
  ];
  fs.writeFileSync(REPORT, lines.join("\n") + "\n");

  // 検索に失敗した鳥が多いときは、障害とみなして、何も書かない
  if (failed > MAX_FAILURES) {
    console.error(`Commonsの検索に失敗した鳥が${failed}種あったため、flightPhotos.jsonは書き換えませんでした`);
    process.exit(1);
  }
  const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(FLIGHT_FILE, JSON.stringify(sorted, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
