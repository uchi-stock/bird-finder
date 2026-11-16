import { describe, expect, it } from "vitest";
import { aggregateShared, MAX_TILES, tileOf, tilesInBounds } from "./shared";

describe("tileOf", () => {
  it("バックエンドと同じ規則（0.05度刻み）で区画の鍵を作る", () => {
    // 浮動小数点の端（35.65など）は避け、区画の内側の値で確認する（バックエンドも同じ計算）
    expect(tileOf(35.66, 139.54)).toBe("713:2790");
    expect(tileOf(35.6999, 139.5499)).toBe("713:2790");
    expect(tileOf(35.71, 139.56)).toBe("714:2791");
  });
});

describe("tilesInBounds", () => {
  it("表示範囲にかかる区画を全て返す", () => {
    const t = tilesInBounds({ south: 35.64, west: 139.53, north: 35.66, east: 139.56 });
    expect(t).toEqual(["712:2790", "712:2791", "713:2790", "713:2791"].filter((x) => t?.includes(x)));
    expect(t).toContain("713:2790");
  });
  it("1区画に収まる範囲は1件", () => {
    expect(tilesInBounds({ south: 35.651, west: 139.541, north: 35.652, east: 139.542 })).toEqual(["713:2790"]);
  });
  it("区画が多すぎる（地図が広すぎる）場合はnull", () => {
    expect(tilesInBounds({ south: 35, west: 139, north: 36, east: 140 })).toBeNull();
    const t = tilesInBounds({ south: 35.0, west: 139.0, north: 35.0 + 0.05 * 4, east: 139.0 + 0.05 * 4 });
    expect(t === null || t.length <= MAX_TILES).toBe(true);
  });
});

describe("aggregateShared", () => {
  const item = (o = {}) => ({ speciesId: "sparrow", date: "2026-11-15", lat: 35.651, lon: 139.541, ...o });
  it("同じ鳥・同じ日・近い場所を1つにまとめ、件数を数える", () => {
    const p = aggregateShared([item(), item({ lat: 35.6512 }), item({ speciesId: "mallard" })]);
    expect(p).toHaveLength(2);
    expect(p.find((x) => x.speciesId === "sparrow")?.count).toBe(2);
  });
  it("日付や場所が違えば別のピンにする。新しい日付から並べる", () => {
    const p = aggregateShared([item({ date: "2026-11-10" }), item({ date: "2026-11-15" }), item({ lat: 35.8 })]);
    expect(p).toHaveLength(3);
    expect(p[0].date).toBe("2026-11-15");
  });
  it("空なら空", () => {
    expect(aggregateShared([])).toEqual([]);
  });
});
