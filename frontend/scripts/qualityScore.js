// 鳥の写真が、「姿を知る1枚目」に向くかを見分ける純粋な関数（GitHub Actionsの選別スクリプトと、単体テストの両方から使う）。
// 題名の語だけでは見分けられない、次の3つを、画像分類モデル（CLIP）のゼロショット分類で判定して除く（#171）。
// - 写真でないもの（図版・絵画。例: オオタカが、古い図鑑の絵のページだった）
// - 動物が写っていないもの（建物・風景。例: アブラコウモリが、駅の建物の写真だった）
// - 獲物をくわえているもの（例: カワウが、魚をくわえた姿だった。姿を掴みにくい）

/** 分類の問い。先頭が、肯定側（写真である・動物である・獲物をくわえている） */
export const QUALITY_LABELS = {
  photo: ["a photograph of a real animal", "an illustration, painting, drawing or old book plate of animals"],
  animal: ["a photo of an animal", "a photo of a building, landscape or object without any animal"],
  prey: ["a bird holding a fish or prey in its beak", "a bird with nothing in its beak"],
};

/**
 * しきい値は、全種の今の画像44枚を目で確かめて、実データで決めた（#171）。
 * - 写真か: 図版（オオタカ）が0.00。ほかの43枚は、最小が0.31（ヒワ。背景がぼけた写真）
 * - 動物か: 建物（アブラコウモリ）が0.00。ほかの43枚は、最小が0.49（キジバト。電線に止まる小さな姿）
 * - 獲物をくわえているか: 魚をくわえたカワウが0.99。ほかの最大は0.90（ダイサギ。水面を見て狙う姿）
 */
export const PHOTO_MIN = 0.15;
export const ANIMAL_MIN = 0.2;
export const PREY_MAX = 0.95;

/** 分類の結果（[{ label, score }]）から、先頭の問いの確度（0〜1）を返す。結果が無ければnull */
export function scoreOf(results, positiveLabel) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const r = results.find((x) => x?.label === positiveLabel);
  return r && Number.isFinite(r.score) ? r.score : 0;
}

/**
 * 1枚目に向かない写真か。scores: { photo, animal, prey }（それぞれの確度。分類できなかったものはnull）。
 * 分類できない（null）ときは、向かないとは言わない（今の動作を壊さない）
 */
export function isUnsuitable(scores) {
  if (!scores) return false;
  const { photo, animal, prey } = scores;
  return (photo != null && photo < PHOTO_MIN) || (animal != null && animal < ANIMAL_MIN) || (prey != null && prey >= PREY_MAX);
}

/** 向かない理由（結果の表・ログに出す）。向くなら、空文字 */
export function unsuitableReason(scores) {
  if (!scores) return "";
  const { photo, animal, prey } = scores;
  if (photo != null && photo < PHOTO_MIN) return "写真でない（図版・絵画）";
  if (animal != null && animal < ANIMAL_MIN) return "動物が写っていない";
  if (prey != null && prey >= PREY_MAX) return "獲物をくわえている";
  return "";
}
