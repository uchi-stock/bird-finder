import { describe, expect, it } from "vitest";
import { GRID_M, HOME_RADIUS_M, JITTER_M, blurLocation, decideShare, distanceM, gridCell, isInJapan, isNearHome } from "./privacy";

const chofu = { lat: 35.6506, lon: 139.5407 };
const SECRET = "device-secret-abc";

describe("distanceM", () => {
  it("同じ点は0、緯度0.01度は約1.11km", () => {
    expect(distanceM(chofu, chofu)).toBe(0);
    expect(distanceM(chofu, { lat: chofu.lat + 0.01, lon: chofu.lon })).toBeGreaterThan(1100);
    expect(distanceM(chofu, { lat: chofu.lat + 0.01, lon: chofu.lon })).toBeLessThan(1120);
  });
  it("経度方向は緯度に応じて縮む（東京で0.01度は約0.9km）", () => {
    const d = distanceM(chofu, { lat: chofu.lat, lon: chofu.lon + 0.01 });
    expect(d).toBeGreaterThan(880);
    expect(d).toBeLessThan(920);
  });
});

describe("gridCell", () => {
  it("同じ格子の点は同じ鍵と中心になり、中心は元の点から約0.7km以内", () => {
    const a = gridCell(chofu);
    const b = gridCell({ lat: chofu.lat + 0.0001, lon: chofu.lon + 0.0001 });
    expect(a.key).toBe(b.key);
    expect(distanceM(chofu, a.center)).toBeLessThan((GRID_M / 2) * Math.SQRT2 + 5);
  });
  it("遠い点は別の格子", () => {
    expect(gridCell(chofu).key).not.toBe(gridCell({ lat: chofu.lat + 0.05, lon: chofu.lon }).key);
  });
});

describe("blurLocation（共有する位置のぼかし）", () => {
  it("同じ場所・同じ日・同じ秘密なら、何度やっても同じ位置（平均して元の位置を割り出せない）", () => {
    const a = blurLocation(chofu, "2026-11-15", SECRET);
    const b = blurLocation({ lat: chofu.lat + 0.0002, lon: chofu.lon - 0.0002 }, "2026-11-15", SECRET);
    expect(b.lat).toBe(a.lat);
    expect(b.lon).toBe(a.lon);
  });
  it("元の位置そのものは返さない（格子の中心から最大でJITTER_Mだけずれた位置）", () => {
    const r = blurLocation(chofu, "2026-11-15", SECRET);
    expect(r.lat).not.toBe(chofu.lat);
    expect(r.lon).not.toBe(chofu.lon);
    const center = gridCell(chofu).center;
    expect(distanceM(r, center)).toBeLessThanOrEqual(JITTER_M * Math.SQRT2 + 1);
  });
  it("日付が変わるとずれ方も変わる", () => {
    const a = blurLocation(chofu, "2026-11-15", SECRET);
    const b = blurLocation(chofu, "2026-11-16", SECRET);
    expect(distanceM(a, b)).toBeGreaterThan(0);
  });
  it("秘密の値が違えば、ずれ方も違う（秘密を知らないと元の位置を逆算できない）", () => {
    const a = blurLocation(chofu, "2026-11-15", "secret-A");
    const b = blurLocation(chofu, "2026-11-15", "secret-B");
    expect(distanceM(a, b)).toBeGreaterThan(0);
  });
  it("ずらし幅は全方向に偏りなく、規定の範囲に収まる（多数の秘密で確認）", () => {
    let minN = Infinity, maxN = -Infinity, minE = Infinity, maxE = -Infinity;
    const center = gridCell(chofu).center;
    for (let i = 0; i < 400; i++) {
      const r = blurLocation(chofu, "2026-11-15", `s${i}`);
      const north = distanceM(center, { lat: r.lat, lon: center.lon }) * Math.sign(r.lat - center.lat);
      const east = distanceM(center, { lat: center.lat, lon: r.lon }) * Math.sign(r.lon - center.lon);
      minN = Math.min(minN, north); maxN = Math.max(maxN, north); minE = Math.min(minE, east); maxE = Math.max(maxE, east);
    }
    for (const v of [minN, minE]) expect(v).toBeLessThan(-JITTER_M * 0.9);
    for (const v of [maxN, maxE]) expect(v).toBeGreaterThan(JITTER_M * 0.9);
    for (const v of [minN, minE, maxN, maxE]) expect(Math.abs(v)).toBeLessThanOrEqual(JITTER_M + 2);
  });
  it("返す位置は日本国内に収まる", () => {
    expect(isInJapan(blurLocation(chofu, "2026-11-15", SECRET))).toBe(true);
  });
});

describe("isNearHome / isInJapan", () => {
  it("自宅が未設定なら近くない", () => {
    expect(isNearHome(chofu, null)).toBe(false);
  });
  it("自宅から半径内は近く、外は近くない", () => {
    const home = chofu;
    expect(isNearHome({ lat: chofu.lat + 0.01, lon: chofu.lon }, home)).toBe(true); // 約1.1km
    expect(isNearHome({ lat: chofu.lat + 0.03, lon: chofu.lon }, home)).toBe(false); // 約3.3km
    expect(HOME_RADIUS_M).toBe(2000);
  });
  it("日本国内の判定", () => {
    expect(isInJapan(chofu)).toBe(true);
    expect(isInJapan({ lat: 51.5, lon: -0.12 })).toBe(false);
  });
});

describe("decideShare", () => {
  it("位置が無ければ共有できない", () => {
    expect(decideShare(null, null, "2026-11-15", SECRET)).toEqual({ ok: false, reason: expect.stringContaining("位置") });
  });
  it("日本国外は共有できない", () => {
    const r = decideShare({ lat: 51.5, lon: -0.12 }, null, "2026-11-15", SECRET);
    expect(r.ok).toBe(false);
  });
  it("自宅周辺は共有できない（理由つき）", () => {
    const r = decideShare({ lat: chofu.lat + 0.005, lon: chofu.lon }, chofu, "2026-11-15", SECRET);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("自宅") });
  });
  it("自宅から離れていれば、ぼかした位置を返す（元の位置は含まない）", () => {
    const here = { lat: chofu.lat + 0.05, lon: chofu.lon };
    const r = decideShare(here, chofu, "2026-11-15", SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shared.lat).not.toBe(here.lat);
      expect(JSON.stringify(r.shared)).not.toContain(String(here.lat));
    }
  });
});
