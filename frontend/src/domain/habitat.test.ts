import { describe, expect, it } from "vitest";
import { classifyHabitats, habitatsFromNominatim, largeImageUrl, overpassQuery } from "./habitat";

const b = (n: number) => Array.from({ length: n }, () => ({ tags: { building: "yes" } }));

describe("classifyHabitats", () => {
  it("川と河川敷の草地は川辺・草地", () => {
    expect(classifyHabitats([{ tags: { waterway: "river" } }, { tags: { landuse: "grass" } }])).toEqual(["waterside", "open"]);
  });
  it("建物が多ければ住宅街", () => {
    expect(classifyHabitats(b(8))).toEqual(["urban"]);
  });
  it("建物が少数だけなら住宅街とは判定しない", () => {
    expect(classifyHabitats(b(2))).toEqual([]);
  });
  it("公園・森は森・林・公園", () => {
    expect(classifyHabitats([{ tags: { leisure: "park" } }, { tags: { natural: "wood" } }])).toEqual(["woodland"]);
  });
  it("tagsなし・該当なしは空", () => {
    expect(classifyHabitats([{}, { tags: { highway: "residential" } }])).toEqual([]);
  });
});

describe("overpassQuery", () => {
  it("座標と半径を含む", () => {
    expect(overpassQuery(35.65, 139.54, 200)).toContain("around:200,35.65,139.54");
  });
});

describe("habitatsFromNominatim", () => {
  it("川は川辺", () => {
    expect(habitatsFromNominatim({ category: "waterway", type: "river" })).toEqual(["waterside"]);
  });
  it("住宅・建物は住宅街", () => {
    expect(habitatsFromNominatim({ category: "building", type: "house", address: { house_number: "1" } })).toEqual(["urban"]);
  });
  it("公園は森・林・公園", () => {
    expect(habitatsFromNominatim({ category: "leisure", type: "park" })).toEqual(["woodland"]);
  });
  it("手がかりがなければ空", () => {
    expect(habitatsFromNominatim({})).toEqual([]);
  });
});

describe("largeImageUrl", () => {
  it("サムネイルのサイズを500pxへ差し替える", () => {
    expect(largeImageUrl("https://upload.wikimedia.org/a/b/c.jpg/330px-c.jpg")).toBe("https://upload.wikimedia.org/a/b/c.jpg/500px-c.jpg");
  });
});
