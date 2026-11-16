import { describe, expect, it } from "vitest";
import { MAX_SEARCH_FAILURES, MIN_CENTER, backgroundRatio, decide, filterCandidates, pickBest, tooManyFailures } from "./photoScore.js";

const N = 64;
// 疑似乱数（再現できるように固定）
function noise(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** 背景: 一定の明るさ＋ごく小さな揺れ（bgNoise）。中央の40%: 大きな揺れ（subject） */
function image(bgNoise, subject, seed = 1) {
  const r = noise(seed);
  const gray = new Uint8Array(N * N);
  const lo = Math.round(N * 0.3);
  const hi = Math.round(N * 0.7);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inCenter = x >= lo && x < hi && y >= lo && y < hi;
      gray[y * N + x] = 128 + Math.round((r() - 0.5) * (inCenter ? subject : bgNoise));
    }
  }
  return gray;
}

describe("backgroundRatio", () => {
  it("背景が単純で、中央に被写体がある画像は、比が小さい", () => {
    const m = backgroundRatio(image(2, 120), N, N);
    expect(m.ratio).toBeLessThan(0.2);
    expect(m.center).toBeGreaterThan(MIN_CENTER);
  });
  it("背景が細かい（森・草むら）画像は、比が大きい", () => {
    const busy = backgroundRatio(image(120, 120), N, N);
    const simple = backgroundRatio(image(2, 120), N, N);
    expect(busy.ratio).toBeGreaterThan(simple.ratio * 3);
  });
  it("無地の画像は、中央の細かさが小さく、被写体が無いとみなせる", () => {
    const m = backgroundRatio(new Uint8Array(N * N).fill(200), N, N);
    expect(m.center).toBeLessThan(MIN_CENTER);
    expect(m.ratio).toBe(Infinity);
  });
  it("極端に小さい画像でも、例外を投げない", () => {
    expect(() => backgroundRatio(new Uint8Array(4), 2, 2)).not.toThrow();
  });
});

describe("filterCandidates", () => {
  const page = (over = {}, infoOver = {}) => ({
    title: "File:Bird.jpg",
    imageinfo: [{ thumburl: "https://u/500px-Bird.jpg", descriptionurl: "https://c/File:Bird.jpg", mime: "image/jpeg", width: 2000, height: 1500, extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: '<a href="x">撮影者</a>' } }, ...infoOver }],
    ...over,
  });
  it("JPEG・十分な大きさ・使えるライセンスの写真を、撮影者（タグを除く）つきで返す", () => {
    const [c] = filterCandidates({ 1: page() });
    expect(c).toMatchObject({ thumbnail: "https://u/500px-Bird.jpg", pageUrl: "https://c/File:Bird.jpg", credit: "撮影者", license: "CC BY-SA 4.0" });
  });
  it("ライセンスが使えない・JPEGでない・小さい・図や飛翔の題名は外す", () => {
    const bad = {
      1: page({}, { extmetadata: { LicenseShortName: { value: "All rights reserved" } } }),
      2: page({}, { mime: "image/svg+xml" }),
      3: page({}, { width: 400, height: 300 }),
      4: page({ title: "File:Bird range map.jpg" }),
      5: page({ title: "File:Bird in flight.jpg" }),
      6: page({ imageinfo: [{}] }),
    };
    expect(filterCandidates(bad)).toEqual([]);
    expect(filterCandidates(undefined)).toEqual([]);
  });
  it("CC0・パブリックドメイン・CC BY も使える", () => {
    const pages = { 1: page({}, { extmetadata: { LicenseShortName: { value: "CC0" } } }), 2: page({}, { extmetadata: { LicenseShortName: { value: "Public domain" } } }), 3: page({}, { extmetadata: { LicenseShortName: { value: "CC BY 2.0" } } }) };
    expect(filterCandidates(pages)).toHaveLength(3);
  });
  it("撮影者が無ければundefined、説明ページのURLが無ければCommonsのトップ", () => {
    const [c] = filterCandidates({ 1: page({}, { descriptionurl: undefined, extmetadata: { LicenseShortName: { value: "CC0" } } }) });
    expect(c.credit).toBeUndefined();
    expect(c.pageUrl).toBe("https://commons.wikimedia.org/");
  });
});

describe("pickBest", () => {
  const c = (id, ratio, center = 20, width = 2000) => ({ id, ratio, center, width });
  it("被写体のある候補のうち、比が最も小さいものを選ぶ", () => {
    expect(pickBest([c("a", 0.5), c("b", 0.2), c("c", 0.9)], null).id).toBe("b");
  });
  it("被写体が無い（無地）候補は選ばない", () => {
    expect(pickBest([c("blank", 0.0, 1), c("ok", 0.6)], null).id).toBe("ok");
    expect(pickBest([c("blank", 0.0, 1)], null)).toBeNull();
  });
  it("比が同じなら、大きい画像を選ぶ", () => {
    expect(pickBest([c("small", 0.3, 20, 1000), c("large", 0.3, 20, 4000)], null).id).toBe("large");
  });
  it("今の画像より明らかに良いとき（0.8倍以下）だけ、差し替える", () => {
    const baseline = { ratio: 1.0, center: 20 };
    expect(pickBest([c("better", 0.7)], baseline).id).toBe("better");
    expect(pickBest([c("slightly", 0.9)], baseline)).toBeNull();
  });
  it("比が等しい（背景が同じくらい単純）ときは、入れ替えない。基準の比が0でも同じ", () => {
    expect(pickBest([c("same", 0.5)], { ratio: 0.5, center: 20 })).toBeNull();
    expect(pickBest([c("zero", 0)], { ratio: 0, center: 20 })).toBeNull();
  });
  it("今の画像が測れていない（被写体が無い・測定失敗）なら、最良の候補を選ぶ", () => {
    expect(pickBest([c("a", 0.9)], { ratio: Infinity, center: 0 }).id).toBe("a");
    expect(pickBest([c("a", 0.9)], undefined).id).toBe("a");
  });
  it("候補が無ければnull", () => {
    expect(pickBest([], null)).toBeNull();
  });
});

describe("decide（安定させる）", () => {
  const m = (ratio, center = 20) => ({ ratio, center });
  const cand = (id, ratio) => ({ id, ratio, center: 20, width: 2000 });
  const existing = { thumbnail: "https://u/old.jpg" };

  it("選び直し済みが今も使えて、新しい候補が明らかには良くないなら、そのまま（毎回入れ替えない）", () => {
    const d = decide({ existing, existingMeasure: m(0.3), wikipediaMeasure: m(1.0), candidates: [cand("a", 0.28), cand("b", 0.25)] });
    expect(d.action).toBe("keep");
  });
  it("新しい候補が、選び直し済みより明らかに良い（0.8倍以下）なら入れ替える", () => {
    const d = decide({ existing, existingMeasure: m(0.5), wikipediaMeasure: m(1.0), candidates: [cand("better", 0.3)] });
    expect(d.action).toBe("replace");
    expect(d.best.id).toBe("better");
  });
  it("選び直し済みが無ければ、Wikipediaの画像を基準にする。明らかに良ければ差し替え、そうでなければ何もしない", () => {
    expect(decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [cand("a", 0.5)] }).action).toBe("replace");
    expect(decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [cand("a", 0.95)] }).action).toBe("none");
  });
  it("選び直し済みが使えない（取得できない・被写体が無い）なら、Wikipediaの画像を基準にし、良い候補が無ければ外す", () => {
    expect(decide({ existing, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [] }).action).toBe("drop");
    expect(decide({ existing, existingMeasure: m(0.1, 1), wikipediaMeasure: m(1.0), candidates: [] }).action).toBe("drop");
    expect(decide({ existing, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [cand("good", 0.4)] }).action).toBe("replace");
  });
  it("選び直し済みと同じ画像が候補に入っていても、入れ替えない（自分自身には、明らかに良いとはならない）", () => {
    const d = decide({ existing, existingMeasure: m(0.3), wikipediaMeasure: m(1.0), candidates: [cand("same", 0.3)] });
    expect(d.action).toBe("keep");
  });
});

describe("tooManyFailures（障害時に書き換えない）", () => {
  it("検索に失敗した鳥が、上限を超えたら true", () => {
    expect(tooManyFailures(0)).toBe(false);
    expect(tooManyFailures(MAX_SEARCH_FAILURES)).toBe(false);
    expect(tooManyFailures(MAX_SEARCH_FAILURES + 1)).toBe(true);
  });
});
