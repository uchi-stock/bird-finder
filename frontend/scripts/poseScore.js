// 鳥の写真が、飛んでいる姿かを見分ける純粋な関数（GitHub Actionsの選別スクリプトと、単体テストの両方から使う）。
// 題名の語（flying等）だけでは、題名に飛翔を示す語が無い写真（例: ユリカモメの写真）を見分けられない。
// そこで、画像そのものを、画像分類モデル（CLIP）のゼロショット分類で、次の3つの問いのどれに近いかで判定する。

/** 分類の問い（3択）。英語の文のほうが、CLIPの精度が高い */
export const POSE_LABELS = {
  flying: "a photo of a bird flying in the air with its wings spread",
  perched: "a photo of a bird standing or perched on the ground or on a branch",
  floating: "a photo of a bird floating or swimming on the water",
};

/**
 * 分類の問い（2択）。調整の結果（#157）、3択では、水面の上を小さく飛ぶ鳥（ユリカモメ）を見逃したが、
 * 2択なら見分けられた。全種の今の画像44枚を目で確かめ、飛んでいる写真1枚（ユリカモメ）の確度0.88に対し、
 * 飛んでいない写真の最大は0.49（ムクドリ。ロープに止まる）だった
 */
export const BINARY_LABELS = {
  flying: "a photo of a bird in flight",
  notFlying: "a photo of a bird that is not flying",
};

/** 3択で、飛んでいる確度が、この値以上なら、飛んでいる写真とみなす */
export const FLYING_THRESHOLD = 0.5;
/** 2択で、飛んでいる確度が、この値以上なら、飛んでいる写真とみなす（飛ぶ0.88と、飛ばない最大0.49の間） */
export const BINARY_THRESHOLD = 0.65;

/** 分類の結果（[{ label, score }]。scoreは、問い全体で合計1の確率）から、指定した問いの確度（0〜1）を返す。結果が無ければnull */
function scoreOf(results, label) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const r = results.find((x) => x?.label === label);
  return r && Number.isFinite(r.score) ? r.score : 0;
}

/** 3択での、飛んでいる確度 */
export function flyingScore(results) {
  return scoreOf(results, POSE_LABELS.flying);
}

/** 2択での、飛んでいる確度 */
export function binaryFlyingScore(results) {
  return scoreOf(results, BINARY_LABELS.flying);
}

/**
 * 飛んでいる写真か。pose: { three, binary }（それぞれの分類の結果）。どちらかが、しきい値以上なら、飛んでいる。
 * 分類できない（結果が無い）ときは、false（飛んでいないものとして扱い、今の動作を壊さない）
 */
export function isFlying(pose, threshold = FLYING_THRESHOLD, binaryThreshold = BINARY_THRESHOLD) {
  const a = flyingScore(pose?.three);
  const b = binaryFlyingScore(pose?.binary);
  return (a !== null && a >= threshold) || (b !== null && b >= binaryThreshold);
}

/** 結果の表に出す、最も確度の高い姿の名前（3択）。2択が飛ぶと判定したときは、「飛ぶ」 */
export function poseName(pose) {
  const results = pose?.three;
  if (isFlying(pose)) return "飛ぶ";
  if (!Array.isArray(results) || results.length === 0) return "—";
  const top = [...results].sort((a, b) => b.score - a.score)[0];
  const names = { [POSE_LABELS.flying]: "飛ぶ", [POSE_LABELS.perched]: "立つ・止まる", [POSE_LABELS.floating]: "浮かぶ" };
  return names[top.label] ?? "—";
}
