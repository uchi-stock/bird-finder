// サムネイルの切り出し範囲の計算（UI非依存の純粋関数）。
// 鳥の周囲の余白（空・水面・無地の背景）が多い画像を、被写体に寄せて、正方形で切り出す。
// 画像は、縮小したグレースケール（0〜255）で渡す。結果は、元の画像に対する割合（0〜1）で返す

/** 元の画像に対する割合で表した、切り出す範囲。幅と高さは、画素では同じ長さ（正方形） */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 被写体の範囲の周囲に残す余白（被写体の一辺に対する割合） */
export const MARGIN = 0.12;
/** 切り出す正方形の一辺の下限（元の画像の短い辺に対する割合）。寄りすぎると、画質が落ちる */
export const MIN_SIDE = 0.5;
/** 切り出す正方形の一辺が、元の画像の短い辺のこの割合を超えるときは、切り出さない（余白が少ない・被写体が大きい） */
export const MAX_SIDE = 0.85;
/** 被写体とみなす画素の下限（画像全体に対する割合）。これ未満は、被写体が見つからないとみなす */
const MIN_SUBJECT = 0.01;
/** 被写体の範囲を決めるとき、両端から除く割合（ノイズ・細かい点を無視する） */
const TRIM = 0.02;
/** 背景（変化の小さい画素）とみなす変化の下限 */
const MIN_EDGE = 6;
/** 背景の変化の中央値に掛けて、被写体とみなす変化のしきい値にする倍率 */
const EDGE_FACTOR = 2;

/** 1画素ごとの輝度の変化の大きさ（横と縦の差の絶対値の和） */
function gradient(gray: ArrayLike<number>, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = x + 1 < w ? Math.abs(gray[i + 1] - gray[i]) : 0;
      const dy = y + 1 < h ? Math.abs(gray[i + w] - gray[i]) : 0;
      g[i] = dx + dy;
    }
  }
  return g;
}

/** 質量の合計の両端からTRIMずつを除いた、範囲の最初と最後の添字 */
function trimmedRange(mass: ArrayLike<number>, total: number): [number, number] {
  const limit = total * TRIM;
  let acc = 0;
  let lo = 0;
  while (lo < mass.length - 1 && acc + mass[lo] <= limit) acc += mass[lo++];
  acc = 0;
  let hi = mass.length - 1;
  while (hi > lo && acc + mass[hi] <= limit) acc += mass[hi--];
  return [lo, hi];
}

/** 被写体の範囲（画素。x1・y1は含まない端） */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 被写体の範囲から、切り出す正方形を決める（輝度による推定と、物体検出の結果の、どちらからも使う）。
 * 被写体の周囲に余白を足し、寄りすぎないようにして、画像の中に収める。余白が少ない・正方形に収まらないときは、null
 */
export function cropFromBox(box: Box, w: number, h: number): Crop | null {
  const short = Math.min(w, h);
  const subject = Math.max(box.x1 - box.x0, box.y1 - box.y0);
  const side = Math.max(subject * (1 + 2 * MARGIN), short * MIN_SIDE);
  if (!(side > 0) || side > short * MAX_SIDE) return null;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const left = Math.min(Math.max(cx - side / 2, 0), w - side);
  const top = Math.min(Math.max(cy - side / 2, 0), h - side);
  return { x: left / w, y: top / h, w: side / w, h: side / h };
}

/**
 * 被写体を含む正方形の範囲を返す。切り出さないほうがよいとき（余白が少ない・被写体が正方形に収まらない・
 * 背景が複雑で被写体の範囲を決められない・被写体が見つからない）は、nullを返す。
 * 背景が単純な画像ほど、被写体の範囲を正しく決められる
 */
export function subjectCrop(gray: ArrayLike<number>, w: number, h: number): Crop | null {
  if (w < 8 || h < 8) return null;
  const g = gradient(gray, w, h);
  // 背景の変化の大きさ（中央値）を基準に、被写体の画素を決める。背景が複雑だと基準が上がり、被写体の画素が散らばる
  const sorted = Float32Array.from(g).sort();
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(MIN_EDGE, median * EDGE_FACTOR);
  const colMass = new Float32Array(w);
  const rowMass = new Float32Array(h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y * w + x] > threshold) {
        colMass[x]++;
        rowMass[y]++;
        total++;
      }
    }
  }
  if (total < w * h * MIN_SUBJECT) return null;
  const [x0, x1] = trimmedRange(colMass, total);
  const [y0, y1] = trimmedRange(rowMass, total);
  return cropFromBox({ x0, y0, x1: x1 + 1, y1: y1 + 1 }, w, h);
}

/** 切り出し範囲を、正方形のセルの中で、画像を置くためのCSS（セルの一辺に対する割合）。画像全体を、切り出し範囲がセルいっぱいになる大きさと位置にする */
export function cropStyle(c: Crop): { width: string; height: string; left: string; top: string } {
  return {
    width: `${100 / c.w}%`,
    height: `${100 / c.h}%`,
    left: `${(-c.x / c.w) * 100}%`,
    top: `${(-c.y / c.h) * 100}%`,
  };
}
