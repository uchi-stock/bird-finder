// 鳥の検出の結果から、切り出し範囲を決める純粋な関数（GitHub Actionsの検出スクリプトと、単体テストの両方から使う）。
// 物体検出（COCOの「bird」クラス）の結果は、画像の画素の座標で受け取る。
import { cropFromBox } from "../src/domain/subjectCrop.ts";

/** 鳥とみなす検出の信頼度の下限 */
export const MIN_SCORE = 0.5;

/**
 * 検出の結果（[{ label, score, box: { xmin, ymin, xmax, ymax } }]）から、主役の鳥の範囲を返す。
 * 鳥が複数いるときは、最も大きい1羽を主役とする（全員を含めると、範囲が大きくなりすぎて、切り出せない）。
 * 鳥がいなければ、null
 */
export function pickBirdBox(detections, w, h, minScore = MIN_SCORE) {
  const birds = (detections ?? []).filter((d) => d?.label === "bird" && d.score >= minScore && d.box);
  if (birds.length === 0) return null;
  const area = (d) => Math.max(0, d.box.xmax - d.box.xmin) * Math.max(0, d.box.ymax - d.box.ymin);
  const main = birds.reduce((a, b) => (area(b) > area(a) ? b : a));
  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  return { x0: clamp(main.box.xmin, w), y0: clamp(main.box.ymin, h), x1: clamp(main.box.xmax, w), y1: clamp(main.box.ymax, h) };
}

const round = (v) => Math.round(v * 1000) / 1000;

/** 切り出し範囲（割合）を、保存する形（小数3桁）にする。切り出さないときは、null */
export function decideCrop(detections, w, h, minScore = MIN_SCORE) {
  const box = pickBirdBox(detections, w, h, minScore);
  if (!box) return null;
  const c = cropFromBox(box, w, h);
  return c ? { x: round(c.x), y: round(c.y), w: round(c.w), h: round(c.h) } : null;
}

/** 取得に失敗した鳥が、半数を超えたか（壊れた結果を書かないため、超えたら何も書かずに失敗する） */
export function tooManyFailures(failed, total) {
  return total > 0 && failed > total / 2;
}

/** 結果の表（Markdown）。rows: [{ name, key, birds, topScore, crop, note }] */
export function buildReport(rows) {
  const lines = ["| 鳥 | 画像 | 検出した鳥 | 最高の信頼度 | 切り出し（位置と大きさ。割合） |", "|---|---|---|---|---|"];
  for (const r of rows) {
    const crop = r.note ?? (r.crop ? `x ${r.crop.x} / y ${r.crop.y} / 一辺 ${Math.round(r.crop.w * 100)}%（幅）` : "切り出さない");
    lines.push(`| ${r.name} | ${r.key ?? "-"} | ${r.birds ?? "-"} | ${r.topScore ?? "-"} | ${crop} |`);
  }
  return `${lines.join("\n")}\n`;
}
