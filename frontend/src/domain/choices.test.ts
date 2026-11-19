import { describe, expect, it } from "vitest";
import { allowedBehaviors, allowedPlaces, behaviorsAfterPlaceChange, ENTRY_MODES, ENTRY_STEPS, impliedBehaviors } from "./choices";

describe("allowedPlaces", () => {
  it("環境未選択なら全ての場所", () => {
    expect(allowedPlaces([])).toHaveLength(9);
  });
  it("住宅街に水辺・草むらは無い", () => {
    const p = allowedPlaces(["urban"]);
    expect(p).not.toContain("water");
    expect(p).not.toContain("grass");
    expect(p).toContain("roof");
    expect(p).toContain("sky");
  });
  it("川辺には屋根・餌台は無く、水辺がある", () => {
    const p = allowedPlaces(["waterside"]);
    expect(p).toContain("water");
    expect(p).not.toContain("roof");
    expect(p).not.toContain("feeder");
  });
  it("複数環境は和集合", () => {
    const p = allowedPlaces(["urban", "waterside"]);
    expect(p).toContain("roof");
    expect(p).toContain("water");
  });
});

describe("allowedBehaviors", () => {
  it("空なら飛ぶ・鳴くのみ", () => {
    expect(allowedBehaviors("sky", [])).toEqual(["flying", "singing"]);
  });
  it("住宅街の屋根では泳ぐを出さない", () => {
    expect(allowedBehaviors("roof", ["urban"])).not.toContain("swimming");
  });
  it("水辺・水面なら泳ぐを出す", () => {
    expect(allowedBehaviors("water", ["waterside"])).toContain("swimming");
  });
  it("水辺・水面なら、水の中に立つ・歩くも出す", () => {
    expect(allowedBehaviors("water", ["waterside"])).toContain("wading");
  });
  it("川辺環境でも、地面の上では泳ぐ・水の中に立つ・歩くは出さない（地上を歩くのは「止まる・立つ・歩く」）", () => {
    const b = allowedBehaviors("ground", ["waterside"]);
    expect(b).not.toContain("swimming");
    expect(b).not.toContain("wading");
    expect(b).toContain("perching");
  });
  it("場所未選択で環境が水辺なら、泳ぐ・水の中に立つ・歩くを出す", () => {
    expect(allowedBehaviors(undefined, ["waterside"])).toEqual(expect.arrayContaining(["swimming", "wading"]));
  });
  it("場所未選択で環境が住宅街なら出さない", () => {
    expect(allowedBehaviors(undefined, ["urban"])).not.toContain("swimming");
  });
  it("場所・環境とも未選択なら全て", () => {
    const b = allowedBehaviors(undefined, []);
    expect(b).toHaveLength(6);
    expect(b).not.toContain("flying");
  });
});

describe("見えない（声だけ）", () => {
  it("どの環境でも選べ、行動は鳴くだけで自動選択される", () => {
    for (const h of ["waterside", "urban", "woodland", "open"] as const) expect(allowedPlaces([h])).toContain("unseen");
    expect(allowedBehaviors("unseen", [])).toEqual(["singing"]);
    expect(impliedBehaviors("unseen")).toEqual(["singing"]);
  });
  it("空から見えないへ変えると、飛ぶが外れて鳴くが入る", () => {
    expect(behaviorsAfterPlaceChange("sky", "unseen", ["flying"])).toEqual(["singing"]);
  });
});

describe("impliedBehaviors", () => {
  it("空なら飛ぶが自動で決まる", () => {
    expect(impliedBehaviors("sky")).toEqual(["flying"]);
    expect(impliedBehaviors("ground")).toEqual([]);
  });
});

describe("behaviorsAfterPlaceChange", () => {
  it("空を選ぶと飛ぶが自動で入る", () => {
    expect(behaviorsAfterPlaceChange(undefined, "sky", [])).toEqual(["flying"]);
  });
  it("空から地面へ変えると、自動で入った飛ぶは外れる", () => {
    expect(behaviorsAfterPlaceChange("sky", "ground", ["flying"])).toEqual([]);
  });
  it("空を解除（未選択）しても飛ぶは外れる", () => {
    expect(behaviorsAfterPlaceChange("sky", undefined, ["flying"])).toEqual([]);
  });
  it("他の行動は残る", () => {
    expect(behaviorsAfterPlaceChange("sky", "ground", ["flying", "singing"])).toEqual(["singing"]);
  });
  it("場所が変わらないときは行動を変えない", () => {
    expect(behaviorsAfterPlaceChange("sky", "sky", ["flying", "singing"])).toEqual(["flying", "singing"]);
  });
});

describe("入口ごとのカード（#60）", () => {
  it("3つの入口があり、両方は全7枚。順序は 環境 → 時間帯 → 場所 → 行動 → 大きさ → 羽の色 → 鳴き声（#186）", () => {
    expect(ENTRY_MODES).toEqual(["voice", "sight", "both"]);
    expect(ENTRY_STEPS.both).toEqual([0, 6, 1, 2, 4, 5, 3]);
  });
  it("鳴き声からは行動・大きさ・羽の色を出さず、姿からは鳴き声を出さない。環境・場所・時間帯は共通", () => {
    expect(ENTRY_STEPS.voice).toEqual([0, 6, 1, 3]);
    expect(ENTRY_STEPS.sight).toEqual([0, 6, 1, 2, 4, 5]);
    for (const m of ENTRY_MODES) for (const common of [0, 1, 6]) expect(ENTRY_STEPS[m]).toContain(common);
  });
});
