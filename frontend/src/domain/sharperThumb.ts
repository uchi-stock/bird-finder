import type { Crop } from "./subjectCrop";

// 切り出して拡大して表示する画像は、500pxの画像から小さな範囲を切るため、実効の解像度が低くなる（#224）。
// 切り出しが小さいほど、大きい幅の画像を取る。幅は、Commonsが許す標準サイズ（500・960・1280）に限る（それ以外は400で拒否される）

const STANDARD_WIDTHS = [500, 960, 1280];
/** 切り出した正方形の一辺として、確保したい元画像の画素数 */
export const TARGET_SIDE = 450;

/** 切り出し範囲から、取る画像の幅を決める（標準サイズのうち、目標を満たす最小のもの。足りなければ最大） */
export function widthForCrop(crop: Crop): number {
  const need = TARGET_SIDE / crop.w;
  return STANDARD_WIDTHS.find((w) => w >= need) ?? STANDARD_WIDTHS[STANDARD_WIDTHS.length - 1];
}

/**
 * サムネイルのURL（.../NNNpx-ファイル名）を、切り出し範囲に見合う幅へ差し替える。
 * 切り出さない・幅の指定が無い・すでに十分な幅のときは、そのまま返す。元画像が小さくて、大きい幅を作れないときは、
 * 取得に失敗するため、呼び出し側で、元のURLへ戻す
 */
export function sharperThumb(src: string, crop: Crop | null): string {
  if (!crop || !(crop.w > 0)) return src;
  const m = src.match(/\/(\d+)px-/);
  if (!m) return src;
  const width = widthForCrop(crop);
  return width > Number(m[1]) ? src.replace(/\/\d+px-/, `/${width}px-`) : src;
}
