// 鳥の写真の選別に使う、純粋な関数（GitHub Actionsの選別スクリプトと、単体テストの両方から使う）。
// 「背景が単純で、中央に被写体がある」写真を選ぶ。画像は、縮小したグレースケール（0〜255）で渡す。

/** 外周とみなす幅（画像の一辺に対する割合） */
export const RING = 0.22;
/** 中央とみなす範囲（一辺の、この割合の幅を、中央から取る） */
export const CENTER = 0.4;
/** 中央の細かさがこれ未満の画像は、被写体が無い（ほぼ無地）とみなして候補から外す */
export const MIN_CENTER = 3;
/** 今の画像より、背景の細かさの比がこの倍率以下に下がるときだけ差し替える */
export const IMPROVE = 0.8;

/** 1画素ごとの輝度の変化の大きさ（横と縦の差の絶対値の和） */
function gradient(gray, w, h) {
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

/**
 * 背景の細かさと被写体の細かさを測る。
 * ring: 外周（背景）の平均の変化。小さいほど背景が単純（空・水面・ぼけた背景）
 * center: 中央（被写体）の平均の変化。小さすぎると、被写体が無い
 * ratio: ring / center。小さいほど「背景は単純で、被写体は細かい」。無地の画像はcenterが小さく、別途外す
 */
export function backgroundRatio(gray, w, h) {
  const g = gradient(gray, w, h);
  const ringW = Math.max(1, Math.round(Math.min(w, h) * RING));
  const cx0 = Math.round((w * (1 - CENTER)) / 2);
  const cx1 = Math.round((w * (1 + CENTER)) / 2);
  const cy0 = Math.round((h * (1 - CENTER)) / 2);
  const cy1 = Math.round((h * (1 + CENTER)) / 2);
  let ringSum = 0;
  let ringN = 0;
  let centerSum = 0;
  let centerN = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x];
      if (x < ringW || y < ringW || x >= w - ringW || y >= h - ringW) {
        ringSum += v;
        ringN++;
      } else if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) {
        centerSum += v;
        centerN++;
      }
    }
  }
  const ring = ringN ? ringSum / ringN : 0;
  const center = centerN ? centerSum / centerN : 0;
  return { ring, center, ratio: center > 0 ? ring / center : Infinity };
}

const ALLOWED_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? [\d.]+)/i;
const EXCLUDED_TITLE = /map|range|distribution|egg|nest|skull|illustration|drawing|plate|painting|specimen|museum|taxiderm|chick|juvenile|feather|footprint|track|flock|in flight|flying|take.?off|landing|soaring|hover/i;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

/**
 * Commonsの検索結果（pages）から、使える写真の候補を選ぶ。
 * JPEG・十分な大きさ・使えるライセンス（CC0・PD・CC BY・CC BY-SA）・図や標本や飛翔でない題名、の条件を満たすもの
 */
export function filterCandidates(pages) {
  const out = [];
  for (const pg of Object.values(pages ?? {})) {
    const info = pg.imageinfo?.[0];
    if (!info?.thumburl) continue;
    if (info.mime !== "image/jpeg") continue;
    if ((info.width ?? 0) < MIN_WIDTH || (info.height ?? 0) < MIN_HEIGHT) continue;
    if (EXCLUDED_TITLE.test(pg.title ?? "")) continue;
    const meta = info.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? "";
    if (!ALLOWED_LICENSE.test(license)) continue;
    out.push({
      title: pg.title,
      thumbnail: info.thumburl,
      pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org/",
      credit: (meta.Artist?.value ?? "").replace(/<[^>]*>/g, "").trim() || undefined,
      license,
      width: info.width,
      height: info.height,
    });
  }
  return out;
}

/**
 * 測定済みの候補から、最も背景が単純なものを選ぶ。
 * 被写体が無い（centerが小さい）候補は外す。今の画像（baseline）より明らかに良い（ratioがIMPROVE倍以下）ときだけ返す。
 * 今の画像が測れていない場合は、最良の候補を返す。どれも条件を満たさなければnull（今のまま）
 */
export function pickBest(candidates, baseline) {
  const eligible = candidates.filter((c) => c.center >= MIN_CENTER && Number.isFinite(c.ratio));
  eligible.sort((a, b) => a.ratio - b.ratio || b.width - a.width);
  const best = eligible[0];
  if (!best) return null;
  if (baseline && Number.isFinite(baseline.ratio) && baseline.center >= MIN_CENTER && best.ratio >= baseline.ratio * IMPROVE) return null; // 等しいときも入れ替えない（厳密に小さいときだけ）
  return best;
}

/** Commonsの検索に失敗した鳥が、この数を超えたら、障害とみなして何も書かない（写真を失わないため） */
export const MAX_SEARCH_FAILURES = 5;

export function tooManyFailures(failed) {
  return failed > MAX_SEARCH_FAILURES;
}

/**
 * 1種の鳥について、photos.jsonをどうするかを決める。毎回違う写真へ入れ替わらないよう、安定させる。
 * - 選び直し済みの写真（existing）が今も使えるなら、それを基準にする。新しい候補が、それより明らかに良い（比がIMPROVE倍以下）ときだけ入れ替える（replace）。そうでなければ今のまま（keep）
 * - 選び直し済みの写真が使えない（取得できない・被写体が無い）なら、Wikipediaの代表画像を基準にする。明らかに良い候補があれば入れ替え（replace）、なければ外す（drop。Wikipediaの画像へ戻る）
 * - 選び直し済みが無く、候補も良くなければ、何もしない（none）
 * existingMeasure・wikipediaMeasure: backgroundRatioの結果（測れなければnull）
 */
export function decide({ existing, existingMeasure, wikipediaMeasure, candidates }) {
  const existingOk = Boolean(existing) && Boolean(existingMeasure) && existingMeasure.center >= MIN_CENTER && Number.isFinite(existingMeasure.ratio);
  const baseline = existingOk ? existingMeasure : wikipediaMeasure;
  const best = pickBest(candidates, baseline);
  if (best) return { action: "replace", best, baseline };
  if (existingOk) return { action: "keep", baseline };
  return { action: existing ? "drop" : "none", baseline };
}
