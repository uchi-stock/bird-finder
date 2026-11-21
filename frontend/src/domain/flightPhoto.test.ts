import { describe, expect, it } from "vitest";
import { curatedFlightPhoto, type CuratedFlight } from "./flightPhoto";

const curated: CuratedFlight = {
  "Streptopelia orientalis": { thumbnail: "https://upload.wikimedia.org/t.jpg", pageUrl: "https://commons.wikimedia.org/wiki/File:t.jpg", credit: "撮影者", license: "CC BY 4.0" },
};

describe("curatedFlightPhoto: 選び直した飛翔の画像（#212）", () => {
  it("学名で、画像を返す。飛翔の画像として扱う（flight: true）", () => {
    expect(curatedFlightPhoto(curated, "Streptopelia orientalis")).toEqual({ ...curated["Streptopelia orientalis"], flight: true });
  });
  it("無い鳥・空の表は、null（検索に任せる）", () => {
    expect(curatedFlightPhoto(curated, "Passer montanus")).toBeNull();
    expect(curatedFlightPhoto({}, "Streptopelia orientalis")).toBeNull();
  });
});
