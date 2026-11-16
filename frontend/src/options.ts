import speciesJson from "./data/species.json";
import { BEHAVIOR_LABEL, PLACE_LABEL } from "./domain/labels";
import type { Behavior, Candidate, Color, Habitat, Place, Species, TimeSlot } from "./domain/types";

// 画面の選択肢の定義（表示名・絵文字）と、画面で共通に使う小さな関数

export const SPECIES = speciesJson as Species[];

/** 地図のピンに使う、種IDから表示名・絵文字を引く（コウモリ以外は鳥） */
export function speciesLabel(id: string): { name: string; emoji: string } {
  const sp = SPECIES.find((s) => s.species_id === id);
  return { name: sp?.name_ja ?? id, emoji: id === "pipistrelle_bat" ? "🦇" : "🐦" };
}

export const SIZES = [
  { level: 1, ref: "キクイタダキ", cm: "約10cm", emoji: "🐥" },
  { level: 2, ref: "スズメ", cm: "約14cm", emoji: "🐤" },
  { level: 3, ref: "ツバメ", cm: "約17cm", emoji: "🐦" },
  { level: 4, ref: "ヒヨドリ", cm: "約28cm", emoji: "🦜" },
  { level: 5, ref: "ハト", cm: "約33cm", emoji: "🕊️" },
  { level: 6, ref: "カラス", cm: "約50cm", emoji: "🦉" },
  { level: 7, ref: "アオサギ", cm: "約90cm", emoji: "🦢" },
];
export const HABITAT_EMOJI: Record<Habitat, string> = { waterside: "🏞️", urban: "🏘️", woodland: "🌳", open: "🌾" };
export const COLORS: { v: Color; label: string; css: string }[] = [
  { v: "brown", label: "茶", css: "#8b5a2b" },
  { v: "black", label: "黒", css: "#222" },
  { v: "white", label: "白", css: "#fff" },
  { v: "gray", label: "灰", css: "#9a9a9a" },
  { v: "blue", label: "青", css: "#2f6fd0" },
  { v: "green", label: "緑", css: "#4c9a3a" },
  { v: "yellow", label: "黄", css: "#e8c81a" },
  { v: "red", label: "赤・橙", css: "#e0662a" },
];
export const BEHAVIORS: { v: Behavior; label: string; emoji: string }[] = [
  { v: "swimming", label: BEHAVIOR_LABEL.swimming, emoji: "🦆" },
  { v: "wading", label: BEHAVIOR_LABEL.wading, emoji: "🦩" },
  { v: "perching", label: BEHAVIOR_LABEL.perching, emoji: "🐾" },
  { v: "flying", label: BEHAVIOR_LABEL.flying, emoji: "🦅" },
  { v: "singing", label: BEHAVIOR_LABEL.singing, emoji: "🎵" },
  { v: "foraging", label: BEHAVIOR_LABEL.foraging, emoji: "🐛" },
  { v: "preening", label: BEHAVIOR_LABEL.preening, emoji: "✨" },
];
export const PLACES: { v: Place; label: string; emoji: string }[] = [
  { v: "feeder", label: PLACE_LABEL.feeder, emoji: "🌻" },
  { v: "ground", label: PLACE_LABEL.ground, emoji: "🌱" },
  { v: "tree", label: PLACE_LABEL.tree, emoji: "🌳" },
  { v: "wire", label: PLACE_LABEL.wire, emoji: "⚡" },
  { v: "roof", label: PLACE_LABEL.roof, emoji: "🏠" },
  { v: "water", label: PLACE_LABEL.water, emoji: "🌊" },
  { v: "grass", label: PLACE_LABEL.grass, emoji: "🌾" },
  { v: "sky", label: PLACE_LABEL.sky, emoji: "☁️" },
  { v: "unseen", label: PLACE_LABEL.unseen, emoji: "👂" },
];

export const TIMES: { v: TimeSlot; label: string; emoji: string }[] = [
  { v: "morning", label: "朝（〜9時ごろ）", emoji: "🌅" },
  { v: "day", label: "日中", emoji: "☀️" },
  { v: "evening", label: "夕方", emoji: "🌇" },
  { v: "night", label: "夜", emoji: "🌙" },
];

export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function closeness(c: Candidate): string {
  if (c.maxScore <= 0) return "";
  const r = c.score / c.maxScore;
  if (r >= 0.75) return "かなり近い";
  if (r >= 0.45) return "近い";
  return "候補のひとつ";
}
