import type { Behavior, Habitat, Place } from "./types";

export const ALL_PLACES: Place[] = ["feeder", "ground", "tree", "wire", "roof", "water", "grass", "sky", "unseen"];
export const ALL_BEHAVIORS: Behavior[] = ["swimming", "wading", "perching", "flying", "singing", "foraging", "preening"];

/** 周辺環境ごとに、現実にあり得る「どこで見たか」 */
export const HABITAT_PLACES: Record<Habitat, Place[]> = {
  waterside: ["water", "ground", "grass", "tree", "wire", "sky", "unseen"],
  urban: ["feeder", "ground", "tree", "wire", "roof", "sky", "unseen"],
  woodland: ["tree", "ground", "grass", "sky", "unseen"],
  open: ["ground", "grass", "tree", "wire", "sky", "unseen"],
};

/** 環境が未選択なら全て。選択済みなら、選択した環境のいずれかであり得る場所（和集合） */
export function allowedPlaces(habitats: Habitat[]): Place[] {
  if (habitats.length === 0) return ALL_PLACES;
  const set = new Set(habitats.flatMap((h) => HABITAT_PLACES[h]));
  return ALL_PLACES.filter((p) => set.has(p));
}

/**
 * 場所・環境から決まる「行動」の選択肢。
 * - 空: 飛ぶ／鳴く のみ（飛ぶは自動選択される）
 * - 見えない（声だけ）: 鳴く のみ（自動選択される）
 * - 飛ぶ: 場所が空のときだけ（空以外の場所で「飛ぶ」を選ぶことはない）
 * - 泳ぐ・水の中に立つ・歩く: 場所が水辺・水面のとき、または場所が未選択で環境が水辺（未選択含む）のときだけ
 */
export function allowedBehaviors(place: Place | undefined, habitats: Habitat[]): Behavior[] {
  if (place === "sky") return ["flying", "singing"];
  if (place === "unseen") return ["singing"];
  const inWater = place === "water" || (place === undefined && (habitats.length === 0 || habitats.includes("waterside")));
  return ALL_BEHAVIORS.filter((b) => b !== "flying" && ((b !== "swimming" && b !== "wading") || inWater));
}

/** 場所から自動で決まる行動（空なら飛ぶ） */
export function impliedBehaviors(place: Place | undefined): Behavior[] {
  if (place === "sky") return ["flying"];
  return place === "unseen" ? ["singing"] : [];
}

/** 場所を変えたときの行動の整理: 前の場所から自動で入った行動は外し、新しい場所から決まる行動を足す */
export function behaviorsAfterPlaceChange(prev: Place | undefined, next: Place | undefined, behaviors: Behavior[]): Behavior[] {
  const implied = new Set(impliedBehaviors(prev));
  const kept = prev === next ? behaviors : behaviors.filter((b) => !implied.has(b));
  return Array.from(new Set([...kept, ...impliedBehaviors(next)]));
}
