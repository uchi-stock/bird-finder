// 鳥の写真から、鳥の位置を検出して、サムネイルの切り出し範囲を決める（GitHub Actionsで実行する。
// 手元・サンドボックスからは、WikimediaとHugging Faceへ届かない）。
// 各鳥の「今、画面に出る画像」（選び直した写真があればそれ、なければWikipediaの代表画像）を取得し、
// 物体検出モデル（COCOの「bird」クラス）で鳥を検出して、鳥に寄せた正方形の範囲を、
// src/data/photoCrops.json（画像のファイル名をキーにした表。値は割合。切り出さないときはnull）へ書く。
// 画像そのものは、保存・加工しない。
//
// 環境変数: SPECIES_IDS（任意。カンマ区切り。指定した鳥だけ処理し、他は今のphotoCrops.jsonのまま残す）
//           REPORT（任意。結果の表（Markdown）の出力先。既定 crops-report.md）
// 実行: node scripts/detectCrops.js（Node 24。TypeScriptの共通ロジックを、そのまま読み込む）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { photoKey } from "../src/domain/photoKey.ts";
import { buildReport, decideCrop, MIN_SCORE, tooManyFailures } from "./cropScore.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SPECIES_FILE = path.resolve(here, "../src/data/species.json");
const PHOTOS_FILE = path.resolve(here, "../src/data/photos.json");
const CROPS_FILE = path.resolve(here, "../src/data/photoCrops.json");
const REPORT = process.env.REPORT ?? "crops-report.md";
const MODEL = "Xenova/detr-resnet-50";
const UA = "bird-finder-photo-crops/1.0 (+https://github.com/uchi-stock/bird-finder)";
const DELAY_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = "json", tries = 3) {
  for (let i = 0; i < tries; i++) {
    await sleep(DELAY_MS);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return as === "json" ? await res.json() : Buffer.from(await res.arrayBuffer());
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      /* 取り直す */
    }
    await sleep(1000 * (i + 1));
  }
  return null;
}

/** 画面に出す画像のURL: 選び直した写真があればそれ。なければ、アプリと同じく、Wikipedia（日本語版）の代表画像 */
async function imageUrl(name, photos) {
  const curated = photos[name]?.thumbnail;
  if (curated) return curated;
  const j = await get(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
  return j && j.type !== "disambiguation" ? (j.thumbnail?.source ?? null) : null;
}

async function main() {
  const { pipeline, RawImage } = await import("@huggingface/transformers");
  const species = JSON.parse(fs.readFileSync(SPECIES_FILE, "utf-8"));
  const photos = JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf-8"));
  const crops = fs.existsSync(CROPS_FILE) ? JSON.parse(fs.readFileSync(CROPS_FILE, "utf-8")) : {};
  const only = (process.env.SPECIES_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const targets = only.length ? species.filter((s) => only.includes(s.species_id)) : species;

  console.log(`モデルを読み込みます: ${MODEL}`);
  const detector = await pipeline("object-detection", MODEL);

  const rows = [];
  const next = only.length ? { ...crops } : {}; // 全種のときは、今の画像のキーだけを残す（使われなくなったキーを消す）
  let failed = 0;
  for (const s of targets) {
    const url = await imageUrl(s.name_ja, photos);
    if (!url) {
      failed++;
      rows.push({ name: s.name_ja, note: "画像のURLを取得できませんでした" });
      continue;
    }
    const key = photoKey(url);
    const buf = await get(url, "buffer");
    if (!buf) {
      failed++;
      rows.push({ name: s.name_ja, key, note: "画像を取得できませんでした" });
      continue;
    }
    try {
      const image = await RawImage.fromBlob(new Blob([buf]));
      const detections = await detector(image, { threshold: 0.3 });
      const birds = detections.filter((d) => d.label === "bird");
      const crop = decideCrop(detections, image.width, image.height);
      next[key] = crop;
      rows.push({ name: s.name_ja, key, birds: birds.length, topScore: birds.length ? Math.max(...birds.map((d) => d.score)).toFixed(2) : "-", crop });
    } catch (e) {
      failed++;
      rows.push({ name: s.name_ja, key, note: `検出に失敗しました: ${e.message}` });
    }
  }
  console.log(buildReport(rows));
  fs.writeFileSync(REPORT, buildReport(rows));
  if (tooManyFailures(failed, targets.length)) {
    console.error(`失敗が多いため、結果を書きません（${failed}/${targets.length}）`);
    process.exitCode = 1;
    return;
  }
  // 失敗した鳥は、前回の結果をそのまま残す
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(CROPS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`書き込みました: ${Object.keys(sorted).length}件（切り出し ${Object.values(sorted).filter(Boolean).length}件）`);
}

main();
