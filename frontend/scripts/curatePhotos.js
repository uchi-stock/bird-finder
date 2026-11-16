// 鳥の写真を、背景が単純なものへ自動で選び直す（GitHub Actionsで実行する。手元・サンドボックスからはWikimediaへ届かない）。
// 各鳥について、Commonsの写真候補と、現在のWikipediaの代表画像を、背景の細かさで比べる。
// 今の画像より明らかに良いものだけを、src/data/photos.json（鳥の和名をキーにした表）へ書く。
//
// 環境変数: SPECIES_IDS（任意。カンマ区切り。指定した鳥だけ処理し、他の鳥は今のphotos.jsonのまま残す）
//           REPORT（任意。結果の表（Markdown）の出力先。既定 curate-report.md）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backgroundRatio, filterCandidates, pickBest } from "./photoScore.js";

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

async function measure(sharp, url) {
  const buf = await get(url, "buffer");
  if (!buf) return null;
  try {
    const { data } = await sharp(buf).resize(SIZE, SIZE, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    return backgroundRatio(new Uint8Array(data), SIZE, SIZE);
  } catch {
    return null;
  }
}

async function main() {
  const { default: sharp } = await import("sharp");
  const species = JSON.parse(fs.readFileSync(SPECIES_FILE, "utf8"));
  const only = (process.env.SPECIES_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const targets = only.length ? species.filter((s) => only.includes(s.species_id)) : species;
  const photos = fs.existsSync(PHOTOS_FILE) ? JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8")) : {};
  const rows = [];

  for (const s of targets) {
    const summary = await get(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.name_ja)}`);
    const baseUrl = summary?.thumbnail?.source;
    const baseline = baseUrl ? await measure(sharp, baseUrl) : null;

    const search = await get(commonsUrl(s.scientific_name));
    const pages = Object.values(search?.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const candidates = filterCandidates(pages).slice(0, MAX_CANDIDATES);
    const measured = [];
    for (const c of candidates) {
      const m = await measure(sharp, c.thumbnail);
      if (m) measured.push({ ...c, ...m });
    }
    const best = pickBest(measured, baseline);
    if (best) photos[s.name_ja] = { thumbnail: best.thumbnail, pageUrl: best.pageUrl, credit: best.credit, license: best.license };
    else delete photos[s.name_ja];
    const f = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));
    rows.push({ s, baseUrl, baseline, best, count: measured.length });
    console.log(`${s.name_ja}: 候補${measured.length}件 / 今 ${f(baseline?.ratio)} → ${best ? `差し替え ${f(best.ratio)}` : "今のまま"}`);
  }

  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 1) + "\n");
  const f = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));
  const img = (u) => (u ? `<img src="${u}" width="110">` : "—");
  const lines = [
    "### 写真の選び直し（背景が単純な写真）",
    "",
    `対象 ${rows.length} 種 / 差し替え ${rows.filter((r) => r.best).length} 種。比は小さいほど、背景が単純で被写体が目立つ。`,
    "",
    "| 鳥 | 今の画像 | 選んだ画像 | 比（今→選択） | 候補数 |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.s.name_ja} | ${img(r.baseUrl)} | ${r.best ? img(r.best.thumbnail) : "今のまま"} | ${f(r.baseline?.ratio)} → ${f(r.best?.ratio)} | ${r.count} |`),
  ];
  fs.writeFileSync(REPORT, lines.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
