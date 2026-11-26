import { describe, expect, it } from "vitest";
import { sharperThumb, TARGET_SIDE, widthForCrop } from "./sharperThumb";

const crop = (w: number) => ({ x: 0, y: 0, w, h: w });
const url = (w: number) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Bird.jpg/${w}px-Bird.jpg?utm_source=commons.wikimedia.org`;

describe("widthForCrop", () => {
  it("切り出しが小さいほど、大きい標準サイズを選ぶ（500・960・1280のどれか）", () => {
    expect(widthForCrop(crop(0.95))).toBe(500);
    expect(widthForCrop(crop(0.5))).toBe(960);
    expect(widthForCrop(crop(0.35))).toBe(1280);
    expect(widthForCrop(crop(0.1))).toBe(1280); // 足りなくても、最大まで
  });
  it("選んだ幅で切り出した一辺が、目標（TARGET_SIDE）以上になる（最大幅で足りる場合）", () => {
    for (const w of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) expect(widthForCrop(crop(w)) * w).toBeGreaterThanOrEqual(TARGET_SIDE);
  });
});

describe("sharperThumb", () => {
  it("小さく切り出す画像は、幅の部分だけを大きい標準サイズへ差し替える（ほかのURLは変えない）", () => {
    expect(sharperThumb(url(500), crop(0.5))).toBe(url(960));
    expect(sharperThumb(url(500), crop(0.264))).toBe(url(1280));
  });
  it("切り出さない・十分な幅・幅の指定が無いときは、そのまま返す", () => {
    expect(sharperThumb(url(500), null)).toBe(url(500));
    expect(sharperThumb(url(500), crop(0.95))).toBe(url(500));
    expect(sharperThumb(url(1280), crop(0.5))).toBe(url(1280)); // 小さくはしない
    expect(sharperThumb("https://example.com/a.jpg", crop(0.3))).toBe("https://example.com/a.jpg");
  });
  it("切り出しの幅が0以下のときは、そのまま返す", () => {
    expect(sharperThumb(url(500), crop(0))).toBe(url(500));
  });
});
