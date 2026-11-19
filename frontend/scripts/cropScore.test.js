import { describe, expect, it } from "vitest";
import { buildReport, decideCrop, pickBirdBox, tooManyFailures } from "./cropScore.js";

const det = (label, score, xmin, ymin, xmax, ymax) => ({ label, score, box: { xmin, ymin, xmax, ymax } });

describe("pickBirdBox: 検出の結果から、鳥の範囲を決める", () => {
  it("birdだけを使い、信頼度が低いものは使わない", () => {
    const b = pickBirdBox([det("person", 0.99, 0, 0, 100, 100), det("bird", 0.3, 10, 10, 20, 20), det("bird", 0.9, 40, 40, 60, 60)], 100, 100);
    expect(b).toEqual({ x0: 40, y0: 40, x1: 60, y1: 60 });
  });
  it("鳥が複数なら、すべてを含む範囲", () => {
    expect(pickBirdBox([det("bird", 0.9, 10, 20, 30, 40), det("bird", 0.8, 50, 30, 70, 60)], 100, 100)).toEqual({ x0: 10, y0: 20, x1: 70, y1: 60 });
  });
  it("鳥がいなければ、null。検出が無い・壊れた値でも、例外にしない", () => {
    expect(pickBirdBox([det("cat", 0.9, 0, 0, 10, 10)], 100, 100)).toBeNull();
    expect(pickBirdBox([], 100, 100)).toBeNull();
    expect(pickBirdBox(undefined, 100, 100)).toBeNull();
    expect(pickBirdBox([null, { label: "bird", score: 0.9 }], 100, 100)).toBeNull();
  });
  it("画像からはみ出した範囲は、画像の中に収める", () => {
    expect(pickBirdBox([det("bird", 0.9, -5, -5, 120, 90)], 100, 100)).toEqual({ x0: 0, y0: 0, x1: 100, y1: 90 });
  });
});

describe("decideCrop: 検出の結果から、保存する切り出し範囲を決める", () => {
  it("鳥が小さければ、鳥に寄った正方形。小数3桁に丸める", () => {
    const c = decideCrop([det("bird", 0.9, 300, 250, 500, 450)], 1000, 800);
    expect(c).not.toBeNull();
    // 画素では正方形（幅 * 1000 と 高さ * 800 が同じ）
    expect(Math.abs(c.w * 1000 - c.h * 800)).toBeLessThan(2);
    expect(c.x).toBeLessThanOrEqual(0.3);
    expect(c.x + c.w).toBeGreaterThanOrEqual(0.5);
    expect(String(c.x).length).toBeLessThanOrEqual(5);
  });
  it("鳥が大きい（余白が少ない）・鳥がいなければ、null", () => {
    expect(decideCrop([det("bird", 0.9, 20, 20, 980, 780)], 1000, 800)).toBeNull();
    expect(decideCrop([], 1000, 800)).toBeNull();
  });
});

describe("tooManyFailures / buildReport", () => {
  it("半数を超えて失敗したら、true", () => {
    expect(tooManyFailures(3, 10)).toBe(false);
    expect(tooManyFailures(6, 10)).toBe(true);
    expect(tooManyFailures(0, 0)).toBe(false);
  });
  it("結果の表に、鳥・画像・検出・切り出しが出る", () => {
    const md = buildReport([
      { name: "スズメ", key: "a.jpg", birds: 1, topScore: 0.98, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } },
      { name: "トビ", key: "b.jpg", birds: 0, topScore: "-", crop: null },
      { name: "ヒヨドリ", note: "画像を取得できませんでした" },
    ]);
    expect(md).toContain("| スズメ | a.jpg | 1 | 0.98 | x 0.1 / y 0.2 / 一辺 50%（幅） |");
    expect(md).toContain("| トビ | b.jpg | 0 | - | 切り出さない |");
    expect(md).toContain("画像を取得できませんでした");
  });
});
