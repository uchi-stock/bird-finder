import { describe, expect, it } from "vitest";
import { allowedBehaviors, allowedPlaces, behaviorsAfterPlaceChange, impliedBehaviors } from "./choices";

describe("allowedPlaces", () => {
  it("環境未選択なら全ての場所", () => {
    expect(allowedPlaces([])).toHaveLength(8);
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
  it("川辺環境の地面では、水辺を歩くを出す", () => {
    expect(allowedBehaviors("ground", ["waterside"])).toContain("swimming");
  });
  it("場所・環境とも未選択なら全て", () => {
    expect(allowedBehaviors(undefined, [])).toHaveLength(6);
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
