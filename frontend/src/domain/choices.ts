import type { Behavior, Habitat, Place } from "./types";

export const ALL_PLACES: Place[] = ["feeder", "ground", "tree", "wire", "roof", "water", "grass", "sky"];
export const ALL_BEHAVIORS: Behavior[] = ["swimming", "perching", "flying", "singing", "foraging", "preening"];

/** 周辺環境ごとに、現実にあり得る「どこで見たか」 */
const HABITAT_PLACES: Record<Habitat, Place[]> = {
  waterside: ["water", "ground", "grass", "tree", "wire", "sky"],
  urban: ["feeder", "ground", "tree", "wire", "roof", "sky"],
  woodland: ["tree", "ground", "grass", "sky"],
  open: ["ground", "grass", "tree", "wire", "sky"],
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
 * - 泳ぐ・水辺を歩く: 水辺の場所、または水辺の環境（未選択含む）のときだけ
 */
export function allowedBehaviors(place: Place | undefined, habitats: Habitat[]): Behavior[] {
  if (place === "sky") return ["flying", "singing"];
  const swimOk = place === "water" || (place === undefined ? habitats.length === 0 || habitats.includes("waterside") : habitats.includes("waterside"));
  return ALL_BEHAVIORS.filter((b) => b !== "swimming" || swimOk);
}

/** 場所から自動で決まる行動（空なら飛ぶ） */
export function impliedBehaviors(place: Place | undefined): Behavior[] {
  return place === "sky" ? ["flying"] : [];
}
