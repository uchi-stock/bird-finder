// 一時的な調査用スクリプト（issue #171、2026-11-19作成）。調査が終わったら削除する。
// 1) 全種の今の画像について、「写真か」「動物か」「獲物をくわえているか」の確度を出す（しきい値を決める材料）
// 2) 指定した鳥（SPECIES_IDS）について、Commonsの候補と今の画像を、確度つきの一覧画像にする（目で選ぶ材料）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterCandidates } from "./photoScore.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const species = JSON.parse(fs.readFileSync(path.resolve(here, "../src/data/species.json"), "utf8"));
const photos = JSON.parse(fs.readFileSync(path.resolve(here, "../src/data/photos.json"), "utf8"));
const OUT = process.env.OUT ?? "calibration";
const FOCUS = (process.env.SPECIES_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const UA = "bird-finder-photo-calibration/1.0 (+https://github.com/uchi-stock/bird-finder)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 問いの文。先頭が、肯定側（写真である・動物である・獲物をくわえている）
const SETS = {
  photo: ["a photograph of a real animal", "an illustration, painting, drawing or old book plate of animals"],
  animal: ["a photo of an animal", "a photo of a building, landscape or object without any animal"],
  prey: ["a bird holding a fish or prey in its beak", "a bird with nothing in its beak"],
};

async function getBuf(url) {
  for (let i = 0; i < 3; i++) {
    await sleep(300);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* 取り直す */
    }
    await sleep(1000 * (i + 1));
  }
  return null;
}
async function getJson(url) {
  const b = await getBuf(url);
  try {
    return b ? JSON.parse(b.toString("utf8")) : null;
  } catch {
    return null;
  }
}
const commonsUrl = (sci) =>
  `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "30", gsrsearch: `"${sci}" filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "500" })}`;

const { default: sharp } = await import("sharp");
const { pipeline, RawImage } = await import("@huggingface/transformers");
const clf = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32");
fs.mkdirSync(OUT, { recursive: true });

async function score(buf) {
  const image = await RawImage.fromBlob(new Blob([buf]));
  const s = {};
  for (const [k, labels] of Object.entries(SETS)) {
    const out = await clf(image, labels);
    s[k] = out.find((x) => x.label === labels[0])?.score ?? 0;
  }
  return s;
}
const fmt = (s) => `ph${s.photo.toFixed(2)} an${s.animal.toFixed(2)} pr${s.prey.toFixed(2)}`;

// 1) 全種の今の画像
for (const s of species) {
  let url = photos[s.name_ja]?.thumbnail;
  if (!url) {
    const j = await getJson(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.name_ja)}`);
    url = j?.thumbnail?.source;
  }
  const buf = url ? await getBuf(url) : null;
  if (!buf) {
    console.log(`CURRENT ${s.species_id}: 画像なし`);
    continue;
  }
  console.log(`CURRENT ${s.species_id}: ${fmt(await score(buf))}`);
}

// 2) 指定した鳥の候補
const TILE_W = 360;
const TILE_H = 270;
for (const s of species.filter((x) => FOCUS.includes(x.species_id))) {
  const search = await getJson(commonsUrl(s.scientific_name));
  const pages = Object.values(search?.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const candidates = filterCandidates(pages).slice(0, 12);
  const items = [];
  const cur = photos[s.name_ja]?.thumbnail;
  if (cur) items.push({ tag: "CUR", title: "(current)", thumbnail: cur });
  candidates.forEach((c, i) => items.push({ tag: String(i + 1), ...c }));
  const composites = [];
  const meta = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const buf = await getBuf(it.thumbnail);
    if (!buf) continue;
    const sc = await score(buf);
    console.log(`${s.species_id} #${it.tag}: ${fmt(sc)} ${it.title}`);
    meta.push({ tag: it.tag, title: it.title, thumbnail: it.thumbnail, pageUrl: it.pageUrl, credit: it.credit, license: it.license, scores: sc });
    const tile = await sharp(buf).resize(TILE_W, TILE_H, { fit: "contain", background: "#222" }).jpeg({ quality: 80 }).toBuffer();
    const x = (i % 4) * TILE_W;
    const y = Math.floor(i / 4) * TILE_H;
    const label = `#${it.tag} ${fmt(sc)}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="22"><rect width="100%" height="22" fill="rgba(0,0,0,0.78)"/><text x="4" y="16" font-size="13" fill="#fff" font-family="DejaVu Sans, sans-serif">${label}</text></svg>`;
    composites.push({ input: tile, left: x, top: y });
    composites.push({ input: Buffer.from(svg), left: x, top: y + TILE_H - 22 });
  }
  await sharp({ create: { width: TILE_W * 4, height: TILE_H * Math.ceil(items.length / 4), channels: 3, background: "#000" } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(path.join(OUT, `cand-${s.species_id}.jpg`));
  fs.writeFileSync(path.join(OUT, `cand-${s.species_id}.json`), JSON.stringify(meta, null, 1));
}
console.log("done");
