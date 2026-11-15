import { describe, expect, it } from "vitest";
import { addSighting, countWithoutLocation, toMapPoints, type Sighting } from "./sightings";
import { blurLocation, distanceM } from "./privacy";

const NOW = new Date("2026-11-15T09:00:00Z");
const SECRET = "secret-1";
const chofu = { lat: 35.6506, lon: 139.5407 };

describe("addSighting", () => {
  it("位置つきで記録を追加する（元の配列は変えない）", () => {
    const base: Sighting[] = [];
    const r = addSighting(base, "sparrow", "2026-11-15", chofu, NOW);
    expect(base).toEqual([]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ speciesId: "sparrow", date: "2026-11-15", lat: chofu.lat, lon: chofu.lon });
  });
  it("位置が無ければ位置なしで記録する", () => {
    const r = addSighting([], "sparrow", "2026-11-15", null, NOW);
    expect(r[0].lat).toBeUndefined();
    expect(r[0].lon).toBeUndefined();
  });
  it("記録ごとにIDが異なる", () => {
    const r = addSighting(addSighting([], "a", "2026-11-15", null, NOW), "b", "2026-11-15", null, NOW);
    expect(r[0].id).not.toBe(r[1].id);
  });
});

describe("toMapPoints（地図に出す点）", () => {
  it("位置は必ずぼかされ、元の位置は含まれない", () => {
    const list = addSighting([], "sparrow", "2026-11-15", chofu, NOW);
    const [p] = toMapPoints(list, SECRET);
    const blurred = blurLocation(chofu, "2026-11-15", SECRET);
    expect(p.lat).toBe(blurred.lat);
    expect(p.lon).toBe(blurred.lon);
    expect(p.lat).not.toBe(chofu.lat);
    expect(distanceM(p, chofu)).toBeLessThan(1500);
    expect(JSON.stringify(p)).not.toContain(String(chofu.lat));
  });
  it("同じ鳥・同じ日・同じ格子は1つにまとめて件数を数える", () => {
    let list: Sighting[] = [];
    list = addSighting(list, "sparrow", "2026-11-15", chofu, NOW);
    list = addSighting(list, "sparrow", "2026-11-15", { lat: chofu.lat + 0.0003, lon: chofu.lon }, NOW);
    const pts = toMapPoints(list, SECRET);
    expect(pts).toHaveLength(1);
    expect(pts[0].count).toBe(2);
  });
  it("鳥・日付・場所が違えば別の点になり、新しい日付が先頭に来る", () => {
    let list: Sighting[] = [];
    list = addSighting(list, "sparrow", "2026-11-14", chofu, NOW);
    list = addSighting(list, "crow", "2026-11-15", chofu, NOW);
    list = addSighting(list, "sparrow", "2026-11-15", { lat: chofu.lat + 0.05, lon: chofu.lon }, NOW);
    const pts = toMapPoints(list, SECRET);
    expect(pts).toHaveLength(3);
    expect(pts[0].date).toBe("2026-11-15");
    expect(pts[pts.length - 1].date).toBe("2026-11-14");
  });
  it("位置の無い記録は地図に出さず、件数だけ数えられる", () => {
    let list: Sighting[] = [];
    list = addSighting(list, "sparrow", "2026-11-15", null, NOW);
    list = addSighting(list, "crow", "2026-11-15", chofu, NOW);
    expect(toMapPoints(list, SECRET)).toHaveLength(1);
    expect(countWithoutLocation(list)).toBe(1);
  });
  it("記録が無ければ空", () => {
    expect(toMapPoints([], SECRET)).toEqual([]);
    expect(countWithoutLocation([])).toBe(0);
  });
});
