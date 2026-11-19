// 鳥の写真を、背景が単純なものへ自動で選び直す（GitHub Actionsで実行する。手元・サンドボックスからはWikimediaへ届かない）。
// 各鳥について、Commonsの写真候補と、現在のWikipediaの代表画像を、背景の細かさで比べる。
// 今の画像より明らかに良いものだけを、src/data/photos.json（鳥の和名をキーにした表）へ書く。
//
// 環境変数: SPECIES_IDS（任意。カンマ区切り。指定した鳥だけ処理し、他の鳥は今のphotos.jsonのまま残す）
//           REPORT（任意。結果の表（Markdown）の出力先。既定 curate-report.md）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backgroundRatio, decide, filterCandidates, tooManyFailures } from "./photoScore.js";
import { isFlying, flyingScore, poseName, POSE_LABELS } from "./poseScore.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SPECIES_FILE = path.resolve(here, "../src/data/species.json");
const PHOTOS_FILE = path.resolve(here, "../src/data/photos.json");
const REPORT = process.env.REPORT ?? "curate-report.md";
// 外部サービスへ負荷をかけないよう、連絡先を含まない一般的な名前で、間隔を空けて取得する
const UA = "bird-finder-photo-curation/1.0 (+https://github.com/uchi-stock/bird-finder)";
const DELAY_MS = 300;
const MAX_CANDIDATES = 12;
const SIZE = 64;

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

function commonsUrl(scientificName) {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "30",
    gsrsearch: `"${scientificName}" filetype:bitmap`,
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "500",
  });
  return `https://commons.wikimedia.org/w/api.php?${q.toString()}`;
}

/** 姿勢の分類（飛んでいる写真かの判定）。モデルを使えないときは、何も返さない（飛んでいないものとして扱う） */
let classifyPose = async () => null;

async function measure(sharp, url) {
  const buf = await get(url, "buffer");
  if (!buf) return null;
  try {
    const { data } = await sharp(buf).resize(SIZE, SIZE, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const pose = await classifyPose(buf);
    return { ...backgroundRatio(new Uint8Array(data), SIZE, SIZE), flying: isFlying(pose), flyingScore: flyingScore(pose), pose: poseName(pose) };
  } catch {
    return null;
  }
}

async function main() {
  const { default: sharp } = await import("sharp");
  // 画像分類モデル（CLIP）で、飛んでいる写真かを見分ける（#157）。取得できなければ、題名の語だけで除く、これまでの動作になる
  try {
    const { pipeline, RawImage } = await import("@huggingface/transformers");
    const clf = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32");
    classifyPose = async (buf) => clf(await RawImage.fromBlob(new Blob([buf])), Object.values(POSE_LABELS));
    console.log("姿勢の分類モデルを読み込みました");
  } catch (e) {
    console.warn(`姿勢の分類モデルを使えません（題名の語だけで除きます）: ${e.message}`);
  }
  const species = JSON.parse(fs.readFileSync(SPECIES_FILE, "utf8"));
  const only = (process.env.SPECIES_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const targets = only.length ? species.filter((s) => only.includes(s.species_id)) : species;
  const photos = fs.existsSync(PHOTOS_FILE) ? JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8")) : {};
  const rows = [];

  let failed = 0;
  for (const s of targets) {
    const summary = await get(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.name_ja)}`);
    const baseUrl = summary?.thumbnail?.source;
    const wikipediaMeasure = baseUrl ? await measure(sharp, baseUrl) : null;
    const existing = photos[s.name_ja];
    const existingMeasure = existing ? await measure(sharp, existing.thumbnail) : null;

    const search = await get(commonsUrl(s.scientific_name));
    if (!search) {
      // 検索に失敗した鳥は、何も変えない（今の写真を残す）
      failed++;
      rows.push({ s, baseUrl, existing, action: "failed", baseline: null, best: null, count: 0 });
      console.log(`${s.name_ja}: Commonsの検索に失敗（今のまま）`);
      continue;
    }
    const pages = Object.values(search?.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const candidates = filterCandidates(pages).slice(0, MAX_CANDIDATES);
    const measured = [];
    for (const c of candidates) {
      const m = await measure(sharp, c.thumbnail);
      if (m) measured.push({ ...c, ...m });
    }
    const d = decide({ existing, existingMeasure, wikipediaMeasure, candidates: measured });
    if (d.action === "replace") photos[s.name_ja] = { thumbnail: d.best.thumbnail, pageUrl: d.best.pageUrl, credit: d.best.credit, license: d.best.license };
    else if (d.action === "drop") delete photos[s.name_ja];
    const f = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));
    rows.push({ s, baseUrl, existing, ...d, best: d.best ?? null, count: measured.length, nowMeasure: existingMeasure ?? wikipediaMeasure, excludedFlying: measured.filter((m) => m.flying).length });
    console.log(`${s.name_ja}: 候補${measured.length}件 / 基準 ${f(d.baseline?.ratio)} → ${d.action}${d.best ? ` ${f(d.best.ratio)}` : ""}`);
    // 姿勢の判定の確認用（飛ぶ確度。今の画像と、候補ごと）
    const now = existingMeasure ?? wikipediaMeasure;
    console.log(`  今の姿: ${now?.pose ?? "—"}（飛ぶ確度 ${f(now?.flyingScore)}） / 候補の飛ぶ確度: ${measured.map((m) => f(m.flyingScore)).join(", ")}`);
  }

  const f = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));
  const img = (u) => (u ? `<img src="${u}" width="110">` : "—");
  const label = { replace: "差し替え", keep: "選び直し済みのまま", drop: "選び直しを外した（Wikipediaの画像へ戻る）", none: "今のまま", failed: "検索に失敗（今のまま）" };
  const changed = rows.filter((r) => r.action === "replace" || r.action === "drop").length;
  const lines = [
    "### 写真の選び直し（背景が単純な写真）",
    "",
    `対象 ${rows.length} 種 / 変更 ${changed} 種 / 検索に失敗 ${failed} 種。比は小さいほど、背景が単純で被写体が目立つ。`,
    "",
    "「今の姿」は、今の画像を分類した姿。「飛ぶ」の写真は、候補から除く・基準にしない（#157）。",
    "",
    "| 鳥 | 今の画像 | 今の姿（飛ぶ確度） | 選んだ画像 | 基準→選択の比 | 結果 | 候補数（うち飛ぶ） |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.s.name_ja} | ${img(r.existing?.thumbnail ?? r.baseUrl)} | ${r.nowMeasure?.pose ?? "—"}（${f(r.nowMeasure?.flyingScore)}） | ${r.best ? img(r.best.thumbnail) : "—"} | ${f(r.baseline?.ratio)} → ${f(r.best?.ratio)} | ${label[r.action]} | ${r.count}（${r.excludedFlying ?? 0}） |`),
  ];
  fs.writeFileSync(REPORT, lines.join("\n") + "\n");

  // 検索に失敗した鳥が多いときは、障害とみなして、写真を書き換えない（写真を失わないため）
  if (tooManyFailures(failed)) {
    console.error(`Commonsの検索に失敗した鳥が${failed}種あったため、photos.jsonは書き換えませんでした`);
    process.exit(1);
  }
  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
