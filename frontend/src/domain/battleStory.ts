import { HABITAT_LABEL } from "./labels";
import type { Behavior, Species } from "./types";

// バトル（#117・#221）の物語。捕まえた鳥と、相手の鳥（ダミー）が、特徴を生かした短い場面で出会う。勝ち負けは無い。
// 材料は、鳥のデータのうち、大きさ・暮らす環境・行動・鳴き声だけを使う（暫定値だが、事実と違う展開を作らないため、
// データに無いこと・推測は書かない）。UIに依存しない純粋関数にして、同じ入力なら同じ物語になる。

/** 画像の動き（CSSの`transform`だけで表す）。鳥の特徴に結びつける */
export type Motion = "sway-slow" | "sway-quick" | "glide" | "float" | "still";

export type SceneId = "meet" | "size" | "move" | "voice" | "end";

export interface Scene {
  id: SceneId;
  title: string;
  text: string;
  /** 捕まえた鳥・相手の鳥の、画像の動き */
  mine: Motion;
  opponent: Motion;
}

/** 大きさの目安（鳥のデータの`size_level`1〜7に対応） */
const SIZE_REF = ["キクイタダキ", "スズメ", "ツバメ", "ヒヨドリ", "ハト", "カラス", "アオサギ"];
const SIZE_CM = ["約10cm", "約14cm", "約17cm", "約28cm", "約33cm", "約50cm", "約90cm"];

/** 行動の説明（データの行動の意味どおり）。複数あるときは、この順で、最初のものを使う */
const MOVE_TEXT: [Behavior, string][] = [
  ["flying", "空を飛び回る"],
  ["swimming", "水に浮かんで泳ぐ"],
  ["wading", "水の中を歩く"],
  ["foraging", "えさを探して、つつく"],
  ["perching", "枝や地面に止まって、歩く"],
  ["singing", "さえずる"],
  ["preening", "羽繕いをする"],
];

/** 鳥の動き。飛ぶ鳥は滑るように、泳ぐ鳥は浮かぶように、小さな鳥は素早く、大きな鳥はゆっくり動かす */
export function motionOf(sp: Species): Motion {
  if (sp.behaviors.includes("flying")) return "glide";
  if (sp.behaviors.includes("swimming")) return "float";
  return sp.size_level <= 2 ? "sway-quick" : "sway-slow";
}

function moveText(sp: Species): string {
  const hit = MOVE_TEXT.find(([b]) => sp.behaviors.includes(b));
  return hit ? hit[1] : "じっとしている";
}

function voiceText(sp: Species): string {
  if (sp.silent) return "ふだんは、ほとんど鳴かない";
  const o = sp.onomatopoeia[0];
  return o ? `「${o}」と聞こえる` : "鳴き声のデータは、まだ無い";
}

function habitatText(sp: Species): string {
  return sp.habitats.length > 0 ? sp.habitats.map((h) => HABITAT_LABEL[h]).join("・") : "さまざまな場所";
}

/** 捕まえた鳥と、相手の鳥の物語を、5つの場面（出会い・大きさ・動き・声・おわり）で作る */
export function buildStory(mine: Species, opp: Species): Scene[] {
  const shared = mine.habitats.filter((h) => opp.habitats.includes(h));
  const meet =
    shared.length > 0
      ? `どちらも「${shared.map((h) => HABITAT_LABEL[h]).join("・")}」で見られる鳥だ。同じ場所で、出会った。`
      : `${mine.name_ja}は「${habitatText(mine)}」、${opp.name_ja}は「${habitatText(opp)}」で見られる。ふだんは、別の場所にいる。`;

  const diff = mine.size_level - opp.size_level;
  const sizeLine = (sp: Species) => `${sp.name_ja}は${SIZE_REF[sp.size_level - 1]}くらい（${SIZE_CM[sp.size_level - 1]}）`;
  const compare = diff === 0 ? "同じくらいの大きさだ。" : diff > 0 ? `${mine.name_ja}のほうが、${diff}段階大きい。` : `${opp.name_ja}のほうが、${-diff}段階大きい。`;

  return [
    { id: "meet", title: "出会い", text: meet, mine: "still", opponent: "still" },
    { id: "size", title: "大きさ", text: `${sizeLine(mine)}。${sizeLine(opp)}。${compare}`, mine: "still", opponent: "still" },
    { id: "move", title: "動き", text: `${mine.name_ja}は、${moveText(mine)}。${opp.name_ja}は、${moveText(opp)}。`, mine: motionOf(mine), opponent: motionOf(opp) },
    { id: "voice", title: "声", text: `${mine.name_ja}は、${voiceText(mine)}。${opp.name_ja}は、${voiceText(opp)}。`, mine: "still", opponent: "still" },
    { id: "end", title: "おわり", text: `${mine.name_ja}と${opp.name_ja}は、勝ち負けなく、それぞれの場所へ帰っていった。`, mine: "still", opponent: "still" },
  ];
}
