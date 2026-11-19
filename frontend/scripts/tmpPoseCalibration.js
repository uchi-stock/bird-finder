// 一時的な調査用スクリプト（issue #157、2026-11-19作成）。調査が終わったら削除する。
// 全種の「今の画像」を取得し、複数の問いの文での飛ぶ確度を並べて、目で確認できる一覧の画像（contact sheet）にする。
// 飛んでいる写真の判定（poseScore.js）のしきい値と問いの文を、正解（目視）と照らして決めるために使う。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const species = JSON.parse(fs.readFileSync(path.resolve(here, "../src/data/species.json"), "utf8"));
const photos = JSON.parse(fs.readFileSync(path.resolve(here, "../src/data/photos.json"), "utf8"));
const OUT = process.env.OUT ?? "pose-calibration";
const UA = "bird-finder-pose-calibration/1.0 (+https://github.com/uchi-stock/bird-finder)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 問いの文の候補。先頭が「飛ぶ」
const SETS = {
  A_current: [
    "a photo of a bird flying in the air with its wings spread",
    "a photo of a bird standing or perched on the ground or on a branch",
    "a photo of a bird floating or swimming on the water",
  ],
  B_binary: ["a photo of a bird in flight", "a photo of a bird that is not flying"],
  C_four: ["a bird flying in the sky with wings open", "a bird perched on a branch", "a bird standing on the ground", "a bird swimming on the water"],
  D_rest: ["a bird in flight with spread wings", "a bird resting on the water", "a bird resting on land"],
};

async function get(url) {
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

async function imageUrl(name) {
  if (photos[name]?.thumbnail) return photos[name].thumbnail;
  const res = await fetch(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`, { headers: { "User-Agent": UA } });
  const j = res.ok ? await res.json() : null;
  return j?.thumbnail?.source ?? null;
}

const { default: sharp } = await import("sharp");
const { pipeline, RawImage } = await import("@huggingface/transformers");
const clf = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32");
fs.mkdirSync(OUT, { recursive: true });

const TILE_W = 300;
const TILE_H = 225;
const rows = [];
for (const s of species) {
  const url = await imageUrl(s.name_ja);
  const buf = url ? await get(url) : null;
  if (!buf) {
    rows.push({ id: s.species_id, note: "画像なし" });
    continue;
  }
  const image = await RawImage.fromBlob(new Blob([buf]));
  const scores = {};
  for (const [k, labels] of Object.entries(SETS)) {
    const out = await clf(image, labels);
    scores[k] = out.find((x) => x.label === labels[0])?.score ?? 0;
  }
  const tile = await sharp(buf).resize(TILE_W, TILE_H, { fit: "contain", background: "#222" }).jpeg({ quality: 80 }).toBuffer();
  rows.push({ id: s.species_id, name: s.name_ja, scores, tile });
  console.log(`${s.species_id}: ${Object.entries(scores).map(([k, v]) => `${k[0]}=${v.toFixed(2)}`).join(" ")}`);
}

// 24枚ずつ（6列×4行）の一覧画像にする
const withTile = rows.filter((r) => r.tile);
for (let page = 0; page * 24 < withTile.length; page++) {
  const chunk = withTile.slice(page * 24, page * 24 + 24);
  const composites = [];
  chunk.forEach((r, i) => {
    const x = (i % 6) * TILE_W;
    const y = Math.floor(i / 6) * TILE_H;
    const label = `${r.id}  ${Object.entries(r.scores).map(([k, v]) => `${k[0]}${v.toFixed(2)}`).join(" ")}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="22"><rect width="100%" height="22" fill="rgba(0,0,0,0.75)"/><text x="4" y="16" font-size="12" fill="#fff" font-family="DejaVu Sans, sans-serif">${label}</text></svg>`;
    composites.push({ input: r.tile, left: x, top: y });
    composites.push({ input: Buffer.from(svg), left: x, top: y + TILE_H - 22 });
  });
  await sharp({ create: { width: TILE_W * 6, height: TILE_H * Math.ceil(chunk.length / 6), channels: 3, background: "#000" } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(path.join(OUT, `sheet-${page + 1}.jpg`));
}
fs.writeFileSync(path.join(OUT, "scores.json"), JSON.stringify(rows.map(({ tile, ...r }) => r), null, 1));
console.log(`書き込みました: ${OUT}`);
