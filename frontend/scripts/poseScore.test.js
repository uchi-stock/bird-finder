import { describe, expect, it } from "vitest";
import { FLYING_THRESHOLD, flyingScore, isFlying, POSE_LABELS, poseName } from "./poseScore.js";

const res = (fly, perched, floating) => [
  { label: POSE_LABELS.flying, score: fly },
  { label: POSE_LABELS.perched, score: perched },
  { label: POSE_LABELS.floating, score: floating },
];

describe("flyingScore / isFlying: 飛んでいる写真かを、分類の結果から判定する（#157）", () => {
  it("飛ぶの確度を返す。順序によらない", () => {
    expect(flyingScore(res(0.8, 0.1, 0.1))).toBe(0.8);
    expect(flyingScore([...res(0.8, 0.1, 0.1)].reverse())).toBe(0.8);
  });
  it("しきい値（0.5）以上なら、飛んでいる。未満なら、飛んでいない", () => {
    expect(isFlying(res(0.9, 0.05, 0.05))).toBe(true);
    expect(isFlying(res(FLYING_THRESHOLD, 0.3, 0.2))).toBe(true);
    expect(isFlying(res(0.3, 0.6, 0.1))).toBe(false);
    expect(isFlying(res(0.2, 0.2, 0.6))).toBe(false);
  });
  it("分類できない（結果が無い・壊れた値）なら、飛んでいないものとして扱う（今の動作を壊さない）", () => {
    expect(flyingScore(undefined)).toBeNull();
    expect(flyingScore([])).toBeNull();
    expect(isFlying(undefined)).toBe(false);
    expect(isFlying([])).toBe(false);
    expect(isFlying([{ label: POSE_LABELS.flying, score: NaN }])).toBe(false);
  });
  it("飛ぶの問いが結果に無ければ、確度は0", () => {
    expect(flyingScore([{ label: "other", score: 1 }])).toBe(0);
  });
  it("poseName: 最も確度の高い姿の名前", () => {
    expect(poseName(res(0.7, 0.2, 0.1))).toBe("飛ぶ");
    expect(poseName(res(0.1, 0.7, 0.2))).toBe("立つ・止まる");
    expect(poseName(res(0.1, 0.2, 0.7))).toBe("浮かぶ");
    expect(poseName(undefined)).toBe("—");
  });
});
