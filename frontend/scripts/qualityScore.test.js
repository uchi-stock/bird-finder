import { describe, expect, it } from "vitest";
import { ANIMAL_MIN, isUnsuitable, PHOTO_MIN, PREY_MAX, QUALITY_LABELS, scoreOf, unsuitableReason } from "./qualityScore.js";

// 目で確かめた実データ（全種の今の画像44枚。確度は、photo / animal / prey）
const ok = (photo, animal, prey) => ({ photo, animal, prey });

describe("isUnsuitable: 1枚目に向かない写真を、実データで見分ける（#171）", () => {
  it("向かない: 図版（オオタカ 0.00 / 0.83 / 0.74）", () => {
    expect(isUnsuitable(ok(0.0, 0.83, 0.74))).toBe(true);
    expect(unsuitableReason(ok(0.0, 0.83, 0.74))).toBe("写真でない（図版・絵画）");
  });
  it("向かない: 動物がいない建物の写真（アブラコウモリ 0.82 / 0.00 / 0.42）", () => {
    expect(isUnsuitable(ok(0.82, 0.0, 0.42))).toBe(true);
    expect(unsuitableReason(ok(0.82, 0.0, 0.42))).toBe("動物が写っていない");
  });
  it("向かない: 魚をくわえた姿（カワウ 0.88 / 0.95 / 0.99）", () => {
    expect(isUnsuitable(ok(0.88, 0.95, 0.99))).toBe(true);
    expect(unsuitableReason(ok(0.88, 0.95, 0.99))).toBe("獲物をくわえている");
  });
  it("向く: 実データで、ぎりぎりの写真（確度が低めでも、向かないとは言わない）", () => {
    expect(isUnsuitable(ok(0.31, 0.85, 0.08))).toBe(false); // ヒワ（photoの最小）
    expect(isUnsuitable(ok(0.86, 0.49, 0.11))).toBe(false); // キジバト（animalの最小）
    expect(isUnsuitable(ok(0.92, 0.76, 0.9))).toBe(false); // ダイサギ（preyの最大。水面を見て狙う姿）
    expect(isUnsuitable(ok(0.9, 0.88, 0.06))).toBe(false); // スズメ
  });
  it("しきい値の境界: photo・animalは、未満で向かない。preyは、以上で向かない", () => {
    expect(isUnsuitable(ok(PHOTO_MIN, 0.9, 0.1))).toBe(false);
    expect(isUnsuitable(ok(PHOTO_MIN - 0.01, 0.9, 0.1))).toBe(true);
    expect(isUnsuitable(ok(0.9, ANIMAL_MIN, 0.1))).toBe(false);
    expect(isUnsuitable(ok(0.9, ANIMAL_MIN - 0.01, 0.1))).toBe(true);
    expect(isUnsuitable(ok(0.9, 0.9, PREY_MAX))).toBe(true);
    expect(isUnsuitable(ok(0.9, 0.9, PREY_MAX - 0.01))).toBe(false);
  });
  it("分類できない（null・未指定）なら、向かないとは言わない（今の動作を壊さない）", () => {
    expect(isUnsuitable(undefined)).toBe(false);
    expect(isUnsuitable({})).toBe(false);
    expect(isUnsuitable(ok(null, null, null))).toBe(false);
    expect(unsuitableReason(undefined)).toBe("");
    expect(unsuitableReason(ok(0.9, 0.9, 0.1))).toBe("");
  });
});

describe("scoreOf", () => {
  const [pos, neg] = QUALITY_LABELS.photo;
  it("先頭の問いの確度を返す。順序によらない。問いが無ければ0、結果が無ければnull", () => {
    expect(scoreOf([{ label: pos, score: 0.7 }, { label: neg, score: 0.3 }], pos)).toBe(0.7);
    expect(scoreOf([{ label: neg, score: 0.3 }, { label: pos, score: 0.7 }], pos)).toBe(0.7);
    expect(scoreOf([{ label: "x", score: 1 }], pos)).toBe(0);
    expect(scoreOf(undefined, pos)).toBeNull();
    expect(scoreOf([], pos)).toBeNull();
    expect(scoreOf([{ label: pos, score: NaN }], pos)).toBe(0);
  });
});
