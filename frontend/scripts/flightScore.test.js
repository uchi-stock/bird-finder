import { describe, expect, it } from "vitest";
import { filterFlightCandidates, pickFlight, toEntry } from "./flightScore.js";

const page = (title, extra = {}) => ({
  title,
  imageinfo: [{ thumburl: `https://upload.wikimedia.org/${title}`, mime: "image/jpeg", width: 1200, height: 800, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "<a>撮影者</a>" } }, ...extra }],
});

describe("filterFlightCandidates", () => {
  it("使える条件の画像を、飛翔の題名のものを先にして返す。飛翔の題名でも外さない", () => {
    const out = filterFlightCandidates({
      a: page("File:Turdus eunomus 1.jpg"),
      b: page("File:Turdus eunomus in flight.jpg"),
      c: page("File:Turdus eunomus egg.jpg"),
      d: page("File:Turdus eunomus map.jpg"),
    });
    expect(out.map((c) => c.title)).toEqual(["File:Turdus eunomus in flight.jpg", "File:Turdus eunomus 1.jpg"]);
    expect(out[0].flightTitle).toBe(true);
    expect(out[0].credit).toBe("撮影者");
  });
  it("JPEG以外・小さい画像・使えないライセンスは外す", () => {
    const out = filterFlightCandidates({
      png: page("File:a.png", { mime: "image/png" }),
      small: page("File:b.jpg", { width: 300, height: 200 }),
      nc: page("File:c.jpg", { extmetadata: { LicenseShortName: { value: "CC BY-NC 4.0" } } }),
      ok: page("File:d.jpg"),
    });
    expect(out.map((c) => c.title)).toEqual(["File:d.jpg"]);
  });
  it("入力が空でも落ちない", () => {
    expect(filterFlightCandidates(undefined)).toEqual([]);
  });
});

describe("pickFlight", () => {
  it("飛んでいて、使えない写真でない候補のうち、確度が最も高いものを選ぶ", () => {
    const best = pickFlight([
      { title: "a", flying: true, score: 0.7, unsuitable: false },
      { title: "b", flying: true, score: 0.95, unsuitable: true },
      { title: "c", flying: true, score: 0.9, unsuitable: false },
      { title: "d", flying: false, score: 0.99, unsuitable: false },
    ]);
    expect(best?.title).toBe("c");
  });
  it("該当が無ければnull", () => {
    expect(pickFlight([{ title: "a", flying: false, score: 0.3, unsuitable: false }])).toBeNull();
    expect(pickFlight([])).toBeNull();
  });
});

describe("toEntry", () => {
  it("画面で使う形（URL・出典）にする。無い項目は入れない", () => {
    expect(toEntry({ thumbnail: "t", pageUrl: "p", credit: "c", license: "CC BY 4.0", title: "x" })).toEqual({ thumbnail: "t", pageUrl: "p", credit: "c", license: "CC BY 4.0" });
    expect(toEntry({ thumbnail: "t", pageUrl: "p" })).toEqual({ thumbnail: "t", pageUrl: "p" });
  });
});
