import { describe, expect, it } from "vitest";
import { MAX_TILES_PER_REQUEST, inJapan, parseTiles, tileOf } from "./tile";

describe("tileOf（約5km四方の区画）", () => {
  it("0.05度刻みの区画番号になる", () => {
    expect(tileOf(35.6506, 139.5407)).toBe("713:2790");
    expect(tileOf(35.6999, 139.5999)).toBe("713:2791");
  });
  it("同じ区画内の点は同じ鍵", () => {
    expect(tileOf(35.651, 139.541)).toBe(tileOf(35.699, 139.549));
  });
});

describe("inJapan", () => {
  it("国内は真、国外・非数は偽", () => {
    expect(inJapan(35.65, 139.54)).toBe(true);
    expect(inJapan(51.5, -0.12)).toBe(false);
    expect(inJapan(NaN, 139)).toBe(false);
    expect(inJapan(35, Infinity)).toBe(false);
  });
});

describe("parseTiles", () => {
  it("正しい形式はタイルの配列にする（重複は除く）", () => {
    expect(parseTiles("713:2790,713:2791,713:2790")).toEqual(["713:2790", "713:2791"]);
  });
  it("未指定・空・文字列でない値はnull", () => {
    expect(parseTiles(undefined)).toBeNull();
    expect(parseTiles("")).toBeNull();
    expect(parseTiles(123)).toBeNull();
  });
  it("形式の違うもの・日本国外の区画はnull", () => {
    expect(parseTiles("a:b")).toBeNull();
    expect(parseTiles("713:2790;1")).toBeNull();
    expect(parseTiles("-1:5")).toBeNull();
    expect(parseTiles("10:10")).toBeNull(); // 国外
    expect(parseTiles("713:99999")).toBeNull();
  });
  it("多すぎる区画はnull（上限を含めて確認）", () => {
    const make = (n) => Array.from({ length: n }, (_, i) => `713:${2500 + i}`).join(",");
    expect(parseTiles(make(MAX_TILES_PER_REQUEST))).toHaveLength(MAX_TILES_PER_REQUEST);
    expect(parseTiles(make(MAX_TILES_PER_REQUEST + 1))).toBeNull();
  });
});
