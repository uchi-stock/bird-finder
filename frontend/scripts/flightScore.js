// 飛翔の画像の選別に使う、純粋な関数（GitHub Actionsの選別スクリプトと、単体テストの両方から使う）。
// 題名の語（flying等）による検索では、見つからない鳥がある（題名に飛翔を示す語が無い写真しかない鳥）。
// そこで、候補を広く集め、画像分類（CLIP）で「飛んでいる写真」を選ぶ（#212）。

import { isAllowedPhoto } from "./photoScore.js";

const MIN_WIDTH = 500;
const MIN_HEIGHT = 300;
// 飛翔を示す題名の語。候補の並びを、これに該当するものから先にする（分類の対象を絞る）
const FLIGHT_WORD = /in flight|flying|flight|take.?off|landing|soaring|hover|flies|fly\b/i;

// 飛んでいない姿を示す題名の語（水の上を走る・歩く・泳ぐ・水浴び・餌を食べる等）。翼を広げていても、飛ぶ姿ではないため、候補から外す
const NOT_FLYING_WORD = /running|runs\b|walking|swimming|bathing|diving|feeding|perch|sitting|standing|nest|chick|egg/i;

/** 題名から、飛翔を示す語を除く（photoScoreの条件は、飛翔の題名を、標準の姿でないとして外すため。飛翔の画像では、その条件だけを外す） */
function withoutFlightWords(title) {
  return String(title ?? "").replace(/in flight|flying|take.?off|landing|soaring|hover/gi, " ");
}

/**
 * Commonsの検索結果（pages）から、飛翔の画像の候補を選ぶ。
 * JPEG・十分な大きさ・使えるライセンス・図や標本や卵でない題名、の条件を満たすもの。飛翔を示す題名のものを、先に並べる
 */
export function filterFlightCandidates(pages) {
  const out = [];
  for (const pg of Object.values(pages ?? {})) {
    const info = pg.imageinfo?.[0];
    if (!info?.thumburl || info.mime !== "image/jpeg") continue;
    if ((info.width ?? 0) < MIN_WIDTH || (info.height ?? 0) < MIN_HEIGHT) continue;
    const meta = info.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? "";
    if (NOT_FLYING_WORD.test(pg.title ?? "") || !isAllowedPhoto(withoutFlightWords(pg.title), license)) continue;
    out.push({
      title: pg.title,
      thumbnail: info.thumburl,
      pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org/",
      credit: (meta.Artist?.value ?? "").replace(/<[^>]*>/g, "").trim() || undefined,
      license,
      flightTitle: FLIGHT_WORD.test(pg.title ?? ""),
    });
  }
  return out.sort((a, b) => Number(b.flightTitle) - Number(a.flightTitle));
}

/**
 * 測定済みの候補（flying: 飛んでいる写真か、score: 飛んでいる確度、unsuitable: 使えない写真（図版・動物がいない等））から、
 * 最も確度の高い、飛んでいる写真を選ぶ。無ければnull
 */
export function pickFlight(measured) {
  const eligible = measured.filter((m) => m.flying && !m.unsuitable && Number.isFinite(m.score));
  eligible.sort((a, b) => b.score - a.score);
  return eligible[0] ?? null;
}

/** 選んだ候補を、flightPhotos.jsonの項目（画面で使う形）にする */
export function toEntry(c) {
  return { thumbnail: c.thumbnail, pageUrl: c.pageUrl, ...(c.credit ? { credit: c.credit } : {}), ...(c.license ? { license: c.license } : {}) };
}
