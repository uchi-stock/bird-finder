import { describe, expect, it } from "vitest";
import { BINARY_LABELS, BINARY_THRESHOLD, binaryFlyingScore, FLYING_THRESHOLD, flyingScore, isFlying, POSE_LABELS, poseName } from "./poseScore.js";

const three = (fly, perched, floating) => [
  { label: POSE_LABELS.flying, score: fly },
  { label: POSE_LABELS.perched, score: perched },
  { label: POSE_LABELS.floating, score: floating },
];
const binary = (fly) => [
  { label: BINARY_LABELS.flying, score: fly },
  { label: BINARY_LABELS.notFlying, score: 1 - fly },
];
const pose = (a, b) => ({ three: a, binary: b });

describe("isFlying: 飛んでいる写真かを、3択・2択の分類の結果から判定する（#157）", () => {
  it("目視で確かめた実データ: ユリカモメ（水面の上を小さく飛ぶ。3択は0.20で見逃し、2択は0.88）は、飛んでいる", () => {
    expect(isFlying(pose(three(0.2, 0.3, 0.5), binary(0.88)))).toBe(true);
  });
  it("目視で確かめた実データ: 飛んでいない写真は、2択の最大が0.49（ムクドリ。ロープに止まる）で、飛んでいない", () => {
    expect(isFlying(pose(three(0.02, 0.9, 0.08), binary(0.49)))).toBe(false);
    expect(isFlying(pose(three(0.02, 0.5, 0.48), binary(0.45)))).toBe(false); // ウ（魚をくわえる）
    expect(isFlying(pose(three(0.18, 0.5, 0.32), binary(0.24)))).toBe(false); // 3択の最大（アブラコウモリの画像）
  });
  it("3択が、しきい値（0.5）以上なら、2択が低くても、飛んでいる（別の候補で見分けられた実績）", () => {
    expect(isFlying(pose(three(0.87, 0.1, 0.03), binary(0.3)))).toBe(true);
    expect(isFlying(pose(three(FLYING_THRESHOLD, 0.3, 0.2), binary(0.1)))).toBe(true);
  });
  it("2択が、しきい値（0.65）以上なら飛んでいる。未満なら、飛んでいない", () => {
    expect(isFlying(pose(three(0.1, 0.8, 0.1), binary(BINARY_THRESHOLD)))).toBe(true);
    expect(isFlying(pose(three(0.1, 0.8, 0.1), binary(BINARY_THRESHOLD - 0.01)))).toBe(false);
  });
  it("分類できない（結果が無い・壊れた値）なら、飛んでいないものとして扱う（今の動作を壊さない）", () => {
    expect(isFlying(undefined)).toBe(false);
    expect(isFlying({})).toBe(false);
    expect(isFlying(pose([], []))).toBe(false);
    expect(isFlying(pose([{ label: POSE_LABELS.flying, score: NaN }], [{ label: BINARY_LABELS.flying, score: NaN }]))).toBe(false);
  });
  it("片方の分類だけ得られても、判定できる", () => {
    expect(isFlying(pose(undefined, binary(0.9)))).toBe(true);
    expect(isFlying(pose(three(0.9, 0.05, 0.05), undefined))).toBe(true);
  });
});

describe("flyingScore / binaryFlyingScore / poseName", () => {
  it("確度を返す。順序によらない。問いが結果に無ければ0、結果が無ければnull", () => {
    expect(flyingScore(three(0.8, 0.1, 0.1))).toBe(0.8);
    expect(flyingScore([...three(0.8, 0.1, 0.1)].reverse())).toBe(0.8);
    expect(binaryFlyingScore(binary(0.7))).toBe(0.7);
    expect(flyingScore([{ label: "other", score: 1 }])).toBe(0);
    expect(flyingScore(undefined)).toBeNull();
    expect(binaryFlyingScore([])).toBeNull();
  });
  it("poseName: 最も確度の高い姿の名前。2択が飛ぶと判定したら、「飛ぶ」", () => {
    expect(poseName(pose(three(0.7, 0.2, 0.1), binary(0.5)))).toBe("飛ぶ");
    expect(poseName(pose(three(0.1, 0.7, 0.2), binary(0.1)))).toBe("立つ・止まる");
    expect(poseName(pose(three(0.1, 0.2, 0.7), binary(0.1)))).toBe("浮かぶ");
    expect(poseName(pose(three(0.2, 0.3, 0.5), binary(0.88)))).toBe("飛ぶ"); // 3択は浮かぶだが、2択が飛ぶ
    expect(poseName(undefined)).toBe("—");
  });
});
