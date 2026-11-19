// 鳥の写真が、飛んでいる姿かを見分ける純粋な関数（GitHub Actionsの選別スクリプトと、単体テストの両方から使う）。
// 題名の語（flying等）だけでは、題名に飛翔を示す語が無い写真（例: ユリカモメの写真）を見分けられない。
// そこで、画像そのものを、画像分類モデル（CLIP）のゼロショット分類で、次の3つの問いのどれに近いかで判定する。

/** 分類の問い（英語の文のほうが、CLIPの精度が高い） */
export const POSE_LABELS = {
  flying: "a photo of a bird flying in the air with its wings spread",
  perched: "a photo of a bird standing or perched on the ground or on a branch",
  floating: "a photo of a bird floating or swimming on the water",
};

/** 飛んでいる確度が、この値以上なら、飛んでいる写真とみなす */
export const FLYING_THRESHOLD = 0.5;

/** 分類の結果（[{ label, score }]。scoreは、問い全体で合計1の確率）から、飛んでいる確度（0〜1）を返す。結果が無ければnull */
export function flyingScore(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const r = results.find((x) => x?.label === POSE_LABELS.flying);
  return r && Number.isFinite(r.score) ? r.score : 0;
}

/** 飛んでいる写真か。分類できない（結果が無い）ときは、false（飛んでいないものとして扱い、今の動作を壊さない） */
export function isFlying(results, threshold = FLYING_THRESHOLD) {
  const s = flyingScore(results);
  return s !== null && s >= threshold;
}

/** 結果の表に出す、最も確度の高い姿の名前 */
export function poseName(results) {
  if (!Array.isArray(results) || results.length === 0) return "—";
  const top = [...results].sort((a, b) => b.score - a.score)[0];
  const names = { [POSE_LABELS.flying]: "飛ぶ", [POSE_LABELS.perched]: "立つ・止まる", [POSE_LABELS.floating]: "浮かぶ" };
  return names[top.label] ?? "—";
}
