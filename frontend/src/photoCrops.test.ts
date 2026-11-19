import { describe, expect, it } from "vitest";
import cropsJson from "./data/photoCrops.json";

// 切り出し範囲の表（scripts/detectCrops.jsが作る）の検査。壊れた値は、画面の画像を崩すため、コミットの前に弾く
const crops = cropsJson as Record<string, { x: number; y: number; w: number; h: number } | null>;

describe("photoCrops.json: 切り出し範囲の表", () => {
  it("キーは画像のファイル名で、値は、切り出さない（null）か、画像の中に収まる割合の範囲", () => {
    for (const [key, c] of Object.entries(crops)) {
      expect(key, "キー").toMatch(/\.\w+$/);
      expect(key, "キーはURLでない").not.toContain("/");
      if (c === null) continue;
      for (const v of [c.x, c.y, c.w, c.h]) expect(Number.isFinite(v), `${key}: 数値`).toBe(true);
      expect(c.x, `${key}: x`).toBeGreaterThanOrEqual(0);
      expect(c.y, `${key}: y`).toBeGreaterThanOrEqual(0);
      expect(c.w, `${key}: w`).toBeGreaterThan(0.4);
      expect(c.h, `${key}: h`).toBeGreaterThan(0.4);
      expect(c.x + c.w, `${key}: 右端`).toBeLessThanOrEqual(1.001);
      expect(c.y + c.h, `${key}: 下端`).toBeLessThanOrEqual(1.001);
    }
  });
});
