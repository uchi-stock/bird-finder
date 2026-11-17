import { describe, expect, it } from "vitest";
import { buildDummyPoints, DUMMY_SPOTS } from "./dummySpots";
import type { Species } from "./types";
import speciesJson from "../data/species.json";

const sp = (id: string, abundance: Species["abundance"], habitats: Species["habitats"]) => ({ species_id: id, abundance, habitats }) as Species;
const SPECIES = [
  sp("rare-water", "rare", ["waterside"]),
  sp("common-water", "common", ["waterside"]),
  sp("very-water", "very_common", ["waterside", "urban"]),
  sp("b-water", "common", ["waterside"]),
  sp("forest", "very_common", ["woodland"]),
];

describe("buildDummyPoints", () => {
  it("地点の環境に合う鳥だけを、出現しやすい順に並べる。同じ出現しやすさは、種IDの順", () => {
    const spots = [DUMMY_SPOTS[0]]; // 水辺
    const ids = buildDummyPoints(SPECIES, spots, 10).map((p) => p.speciesId);
    expect(ids).toEqual(["very-water", "b-water", "common-water", "rare-water"]);
  });

  it("地点ごとに、上位perSpot種だけを出す", () => {
    expect(buildDummyPoints(SPECIES, [DUMMY_SPOTS[0]], 2)).toHaveLength(2);
  });

  it("再現できる: 同じ入力なら、同じ結果", () => {
    expect(buildDummyPoints(SPECIES)).toEqual(buildDummyPoints(SPECIES));
  });

  it("いる可能性は、出現しやすさから決める（very_common→高、common→中、uncommon・rare→低）", () => {
    const byId = Object.fromEntries(buildDummyPoints(SPECIES, [DUMMY_SPOTS[0]], 10).map((p) => [p.speciesId, p.likelihood]));
    expect(byId).toMatchObject({ "very-water": "高", "common-water": "中", "rare-water": "低" });
  });

  it("鳥は、地点の周り（約2.5km以内）に並び、重ならない", () => {
    const points = buildDummyPoints(SPECIES, [DUMMY_SPOTS[0]], 10);
    const spot = DUMMY_SPOTS[0];
    for (const p of points) {
      expect(Math.hypot(p.lat - spot.lat, p.lon - spot.lon)).toBeLessThan(0.0215);
    }
    expect(new Set(points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)).size).toBe(points.length);
  });

  it("すべての地点名が、ダミーで始まり、実在の地名を含まない。キーは重複しない", () => {
    for (const s of DUMMY_SPOTS) expect(s.label.startsWith("ダミー")).toBe(true);
    const points = buildDummyPoints(speciesJson as Species[]);
    expect(points.every((p) => p.spotLabel.startsWith("ダミー"))).toBe(true);
    expect(new Set(points.map((p) => p.key)).size).toBe(points.length);
  });

  it("実際の鳥種データで、各地点に鳥が並ぶ", () => {
    const points = buildDummyPoints(speciesJson as Species[]);
    for (const s of DUMMY_SPOTS) expect(points.filter((p) => p.spotId === s.id).length).toBeGreaterThan(0);
  });
});
