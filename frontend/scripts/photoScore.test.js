import { describe, expect, it } from "vitest";
import { MAX_SEARCH_FAILURES, MIN_CENTER, backgroundRatio, decide, filterCandidates, isAllowedEntry, isAllowedPhoto, pickBest, tooManyFailures } from "./photoScore.js";

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
  it("CC0・CC BYは使える。Public domainは使わない（古い図版・絵画が大半のため）", () => {
    const pages = { 1: page({}, { extmetadata: { LicenseShortName: { value: "CC0" } } }), 2: page({}, { extmetadata: { LicenseShortName: { value: "Public domain" } } }), 3: page({}, { extmetadata: { LicenseShortName: { value: "CC BY 2.0" } } }) };
    expect(filterCandidates(pages)).toHaveLength(2);
  });
  it("博物館の標本・図版・絵画・巻物の題名は外す（背景が無地で指標では有利になるが、写真として不向き）", () => {
    const bad = ["File:Emberiza_spodocephala_MHNT.ZOO.2011.11.219.jpg", "File:Bird_plate_1838.jpg", "File:Bird_watercolour.jpg", "File:Bird_scroll.jpg", "File:Bird_lithograph.jpg", "File:Mounted_bird.jpg"];
    for (const t of bad) expect(isAllowedPhoto(t, "CC BY-SA 4.0"), t).toBe(false);
    expect(isAllowedPhoto("File:Eurasian_tree_sparrow_in_Osaka.jpg", "CC BY-SA 4.0")).toBe(true);
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
  // 選び直し済みの写真（いまの条件を満たす: 使えるライセンスと、標準の題名）
  const existing = { thumbnail: "https://u/old.jpg", pageUrl: "https://commons.wikimedia.org/wiki/File:Sparrow_in_Osaka.jpg", license: "CC BY-SA 4.0" };

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

describe("decide: 飛んでいる写真を、1枚目に使わない（#157。ユリカモメの1枚目が飛んでいた）", () => {
  const m = (ratio, flying = false) => ({ ratio, center: 20, flying });
  const cand = (id, ratio, flying = false) => ({ id, ratio, center: 20, width: 1000, flying });
  const existing = { thumbnail: "https://u/old.jpg", pageUrl: "https://commons.wikimedia.org/wiki/File:Black-headed_Gull_02.jpg", license: "CC BY-SA 4.0" };

  it("選び直し済みの写真が、飛んでいると判定されたら、使えないものとして扱い、飛んでいない候補へ差し替える", () => {
    const d = decide({ existing, existingMeasure: m(0.2, true), wikipediaMeasure: m(1.0), candidates: [cand("perched", 0.5)] });
    expect(d.action).toBe("replace");
    expect(d.best.id).toBe("perched");
  });
  it("選び直し済みが飛んでいて、飛んでいない候補が無ければ、外す（Wikipediaの画像へ戻る）", () => {
    expect(decide({ existing, existingMeasure: m(0.2, true), wikipediaMeasure: m(1.0), candidates: [] }).action).toBe("drop");
  });
  it("飛んでいる候補は、背景がどれだけ単純でも、選ばない", () => {
    const d = decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [cand("flying", 0.1, true), cand("perched", 0.6)] });
    expect(d.action).toBe("replace");
    expect(d.best.id).toBe("perched");
    expect(decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [cand("flying", 0.1, true)] }).action).toBe("none");
  });
  it("Wikipediaの代表画像が飛んでいるなら、基準にしない。飛んでいない候補があれば、無条件で選ぶ", () => {
    // 基準が飛んでいない（0.5）なら、0.6は明らかには良くないため、入れ替えない
    expect(decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(0.5), candidates: [cand("a", 0.6)] }).action).toBe("none");
    // 基準が飛んでいる（0.5）なら、0.6でも選ぶ
    const d = decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(0.5, true), candidates: [cand("a", 0.6)] });
    expect(d.action).toBe("replace");
    expect(d.best.id).toBe("a");
  });
  it("姿勢を判定できていない（flyingが無い）写真は、飛んでいないものとして扱う（今の動作を壊さない）", () => {
    const d = decide({ existing, existingMeasure: { ratio: 0.3, center: 20 }, wikipediaMeasure: { ratio: 1.0, center: 20 }, candidates: [{ id: "x", ratio: 0.29, center: 20, width: 1000 }] });
    expect(d.action).toBe("keep");
  });
});

describe("decide: 図版・動物がいない画像・獲物をくわえた姿も、使えない写真として、1枚目に使わない（#171）", () => {
  const m = (ratio, unsuitable = false) => ({ ratio, center: 20, unsuitable });
  const cand = (id, ratio, unsuitable = false) => ({ id, ratio, center: 20, width: 1000, unsuitable });
  const existing = { thumbnail: "https://u/old.jpg", pageUrl: "https://commons.wikimedia.org/wiki/File:Plate.jpg", license: "CC BY-SA 4.0" };

  it("選び直し済みの写真が、使えない写真（図版など）なら、外すか、使える候補へ差し替える", () => {
    expect(decide({ existing, existingMeasure: m(0.2, true), wikipediaMeasure: m(1.0), candidates: [] }).action).toBe("drop");
    const d = decide({ existing, existingMeasure: m(0.2, true), wikipediaMeasure: m(1.0), candidates: [cand("good", 0.5)] });
    expect(d.action).toBe("replace");
    expect(d.best.id).toBe("good");
  });
  it("使えない候補は、背景がどれだけ単純でも、選ばない", () => {
    const d = decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [cand("plate", 0.05, true), cand("photo", 0.6)] });
    expect(d.best.id).toBe("photo");
    expect(decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(1.0), candidates: [cand("plate", 0.05, true)] }).action).toBe("none");
  });
  it("Wikipediaの代表画像が使えない写真（建物など）なら、基準にしない。使える候補があれば、無条件で選ぶ", () => {
    expect(decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(0.5), candidates: [cand("a", 0.6)] }).action).toBe("none");
    const d = decide({ existing: undefined, existingMeasure: null, wikipediaMeasure: m(0.5, true), candidates: [cand("a", 0.6)] });
    expect(d.action).toBe("replace");
  });
});

describe("tooManyFailures（障害時に書き換えない）", () => {
  it("検索に失敗した鳥が、上限を超えたら true", () => {
    expect(tooManyFailures(0)).toBe(false);
    expect(tooManyFailures(MAX_SEARCH_FAILURES)).toBe(false);
    expect(tooManyFailures(MAX_SEARCH_FAILURES + 1)).toBe(true);
  });
});

describe("isAllowedEntry（選び直し済みの写真を、いまの条件で見直す）", () => {
  const entry = (title, license) => ({ pageUrl: `https://commons.wikimedia.org/wiki/File:${title}`, license });
  it("条件を満たす写真は使える。ライセンスや題名が条件を外れたものは使えない", () => {
    expect(isAllowedEntry(entry("Sparrow_in_Osaka.jpg", "CC BY-SA 4.0"))).toBe(true);
    expect(isAllowedEntry(entry("Hypsipetes_amaurotis_1838.jpg", "Public domain"))).toBe(false);
    expect(isAllowedEntry(entry("Emberiza_MHNT.ZOO.2011.jpg", "CC BY-SA 4.0"))).toBe(false);
    expect(isAllowedEntry(undefined)).toBe(false);
  });
  it("URLエンコードされた題名も見られる。壊れたエンコードでも例外を投げない", () => {
    expect(isAllowedEntry(entry("%E5%86%99%E7%94%9F%E7%8F%8D%E7%A6%BD%E5%9B%BE%E5%8D%B7.jpg", "CC BY 4.0"))).toBe(false);
    // 壊れたエンコード（途中で切れた%E0%A4%A）は、デコードできないが、例外にせず、そのままの文字列で判定する
    expect(isAllowedEntry({ pageUrl: "https://c/wiki/File:Sparrow_%E0%A4%A.jpg", license: "CC BY 4.0" })).toBe(true);
  });
  it("選び直し済みが、いまの条件を外れていたら、使えないものとして扱い、外す（自動で直る）", () => {
    const old = entry("Hypsipetes_amaurotis_1838.jpg", "Public domain");
    expect(decide({ existing: old, existingMeasure: { ratio: 0.1, center: 20 }, wikipediaMeasure: { ratio: 1.0, center: 20 }, candidates: [] }).action).toBe("drop");
    const d = decide({ existing: old, existingMeasure: { ratio: 0.1, center: 20 }, wikipediaMeasure: { ratio: 1.0, center: 20 }, candidates: [{ id: "photo", ratio: 0.3, center: 20, width: 2000 }] });
    expect(d.action).toBe("replace");
  });
});
