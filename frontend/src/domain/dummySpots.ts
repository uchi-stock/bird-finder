import type { Abundance, Habitat, Species } from "./types";

// バトル（#117）を視野に、地図へ出すダミーデータ。実際の観察記録ではない。
// 「鳥が多い場所」（ダミー地点）に、「いる可能性の高い鳥」を並べる。決め方は固定で、再現できる。
// 本物の記録（端末内・共有バックエンド）には、混ぜない・保存しない・共有しない。
// 実在の場所の名前は使わない（ダミー地点A（水辺）など）。座標も、多摩川中流域の中心付近の、仮の位置である。

export interface DummySpot {
  id: string;
  /** 表示名。必ず「ダミー」で始める */
  label: string;
  habitat: Habitat;
  lat: number;
  lon: number;
}

export type Likelihood = "高" | "中" | "低";

export interface DummyPoint {
  key: string;
  spotId: string;
  spotLabel: string;
  speciesId: string;
  lat: number;
  lon: number;
  /** いる可能性（出現しやすさから決めた目安。確率ではない） */
  likelihood: Likelihood;
}

export const DUMMY_SPOTS: DummySpot[] = [
  { id: "dummy-a", label: "ダミー地点A（水辺）", habitat: "waterside", lat: 35.62, lon: 139.48 },
  { id: "dummy-b", label: "ダミー地点B（森林）", habitat: "woodland", lat: 35.7, lon: 139.56 },
  { id: "dummy-c", label: "ダミー地点C（草地）", habitat: "open", lat: 35.62, lon: 139.62 },
  { id: "dummy-d", label: "ダミー地点D（市街地）", habitat: "urban", lat: 35.7, lon: 139.48 },
];

const WEIGHT: Record<Abundance, number> = { very_common: 4, common: 3, uncommon: 2, rare: 1 };
const LIKELIHOOD: Record<Abundance, Likelihood> = { very_common: "高", common: "中", uncommon: "低", rare: "低" };

// 地点の周りに、鳥を並べる半径（度）。約2.2km。ピンが重ならないよう、円周上に等間隔で置く
const RING = 0.02;

/**
 * 各地点の環境に合う鳥のうち、出現しやすい順に上位perSpot種を、地点の周りへ並べる。
 * 同じ出現しやすさは、種IDの順にそろえる（再現できる）
 */
export function buildDummyPoints(species: Species[], spots: DummySpot[] = DUMMY_SPOTS, perSpot = 4): DummyPoint[] {
  const points: DummyPoint[] = [];
  for (const spot of spots) {
    const picked = species
      .filter((s) => s.habitats.includes(spot.habitat))
      .sort((a, b) => WEIGHT[b.abundance] - WEIGHT[a.abundance] || a.species_id.localeCompare(b.species_id))
      .slice(0, perSpot);
    picked.forEach((s, i) => {
      const angle = (2 * Math.PI * i) / picked.length;
      points.push({
        key: `${spot.id}|${s.species_id}`,
        spotId: spot.id,
        spotLabel: spot.label,
        speciesId: s.species_id,
        lat: spot.lat + RING * Math.sin(angle),
        lon: spot.lon + RING * Math.cos(angle),
        likelihood: LIKELIHOOD[s.abundance],
      });
    });
  }
  return points;
}
