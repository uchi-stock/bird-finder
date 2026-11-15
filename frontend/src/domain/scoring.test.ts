import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json";
import { MAX_SHOWN, hasAnyInput, identify, monthToSeason, pickTop, voiceSimilarity } from "./scoring";
import type { Observation, Species } from "./types";

const species = speciesJson as Species[];
const empty: Observation = { colors: [], behaviors: [], habitats: [], onomatopoeia: "" };
const top = (obs: Observation, n: number) => identify(obs, species).slice(0, n).map((c) => c.species.name_ja);

describe("典型的な観察入力で期待する候補が上位3件に入る", () => {
  it("小型・茶・地面で採食・市街地 → スズメ", () => {
    expect(top({ ...empty, sizeLevel: 2, colors: ["brown"], behaviors: ["foraging"], place: "ground" }, 3)).toContain("スズメ");
  });
  it("小型・緑・木の中 → メジロ", () => {
    expect(top({ ...empty, sizeLevel: 2, colors: ["green", "white"], place: "tree" }, 3)).toContain("メジロ");
  });
  it("小型・白黒・地面を歩く → ハクセキレイ（セキレイ類・コチドリと同点になるため上位5件）", () => {
    expect(top({ ...empty, sizeLevel: 3, colors: ["white", "black"], behaviors: ["foraging"], place: "ground" }, 5)).toContain("ハクセキレイ");
  });
  it("最大級・灰色・水辺 → アオサギ", () => {
    expect(top({ ...empty, sizeLevel: 7, colors: ["gray"], place: "water" }, 3)).toContain("アオサギ");
  });
  it("オノマトペ ホーホケキョ → ウグイス", () => {
    expect(top({ ...empty, onomatopoeia: "ホーホケキョ" }, 1)).toEqual(["ウグイス"]);
  });
  it("ひらがな・長音違いのオノマトペ「ぴーひょろろ」 → トビ", () => {
    expect(top({ ...empty, onomatopoeia: "ぴーひょろろ" }, 3)).toContain("トビ");
  });
});

describe("未入力・矛盾の扱い", () => {
  it("未入力のみなら全種スコア0で、加点も減点もない", () => {
    const r = identify(empty, species);
    expect(r).toHaveLength(species.length);
    expect(r.every((c) => c.score === 0)).toBe(true);
    expect(hasAnyInput(empty)).toBe(false);
  });
  it("矛盾があっても候補から除外されない", () => {
    const r = identify({ ...empty, sizeLevel: 1, place: "water", behaviors: ["swimming"] }, species);
    expect(r).toHaveLength(species.length);
    const heron = r.find((c) => c.species.name_ja === "アオサギ")!;
    expect(heron.conflicting).toContain("大きさ");
  });
  it("泳いでいたのにスズメは矛盾として減点される", () => {
    const r = identify({ ...empty, behaviors: ["swimming"] }, species);
    const sparrow = r.find((c) => c.species.name_ja === "スズメ")!;
    expect(sparrow.score).toBeLessThan(0);
    expect(sparrow.conflicting.length).toBeGreaterThan(0);
  });
  it("色は選択数に比例して加点しない（一致割合で正規化）", () => {
    const one = identify({ ...empty, colors: ["black"] }, species).find((c) => c.species.name_ja === "ハシブトガラス")!;
    const many = identify({ ...empty, colors: ["black", "white", "gray", "red"] }, species).find((c) => c.species.name_ja === "ハシブトガラス")!;
    expect(many.score).toBeLessThan(one.score);
  });
  it("鳴き声が一致しなくても減点しない", () => {
    const r = identify({ ...empty, onomatopoeia: "ゾゾゾゾ" }, species);
    // 加わるのは地域での出現しやすさ（最大+1）のみ。減点・矛盾はない
    expect(r.every((c) => c.score >= 0 && c.score <= 1 && c.conflicting.length === 0)).toBe(true);
  });
});

describe("時間帯", () => {
  it("未入力なら時間帯は加点も減点もしない", () => {
    const c = identify(empty, species).find((c) => c.species.name_ja === "トビ")!;
    expect(c.unknown).toContain("時間帯");
    expect(c.score).toBe(0);
  });
  it("昼行性のトビは夕方だと軽く減点されるが除外されない", () => {
    const r = identify({ ...empty, time: "evening" }, species);
    const kite = r.find((c) => c.species.name_ja === "トビ")!;
    expect(kite.conflicting).toContain("時間帯");
    const atDay = identify({ ...empty, time: "day" }, species).find((c) => c.species.name_ja === "トビ")!;
    expect(kite.score).toBeLessThan(atDay.score);
    expect(atDay.score - kite.score).toBeLessThan(2);
    expect(r).toHaveLength(species.length);
  });
  it("朝にアオサギは時間帯が一致する", () => {
    const heron = identify({ ...empty, time: "morning" }, species).find((c) => c.species.name_ja === "アオサギ")!;
    expect(heron.matching).toContain("時間帯");
  });
});

describe("周辺環境", () => {
  it("水辺ならカワセミが上位、一致しない環境は減点されない", () => {
    const r = identify({ ...empty, habitats: ["waterside"] }, species);
    expect(r.slice(0, 15).map((c) => c.species.name_ja)).toContain("カワセミ");
    expect(r.every((c) => c.score >= 0)).toBe(true);
  });
  it("未入力なら周辺環境は加点も減点もしない", () => {
    expect(identify(empty, species)[0].unknown).toContain("周辺環境");
  });
});

describe("地域での出現しやすさ（事前情報）", () => {
  const sparrow = species.find((s) => s.species_id === "sparrow")!;
  const rareTwin: Species = { ...sparrow, species_id: "twin", name_ja: "あ", abundance: "rare" };
  it("入力が同じなら、よく見られる鳥が稀な鳥より上位になる", () => {
    const r = identify({ ...empty, sizeLevel: 2 }, [rareTwin, sparrow]);
    expect(r[0].species.species_id).toBe("sparrow");
  });
  it("稀な鳥でも減点・除外されない", () => {
    const r = identify({ ...empty, sizeLevel: 2 }, [rareTwin, sparrow]);
    expect(r).toHaveLength(2);
    expect(r[1].score).toBeGreaterThanOrEqual(2);
  });
  it("未入力のときは出現しやすさだけで順位をつけない（全種スコア0）", () => {
    expect(identify(empty, species).every((c) => c.score === 0)).toBe(true);
  });
  it("事前情報は入力一致より小さい（一致した稀な鳥が、一致しないよく見る鳥に勝つ）", () => {
    const r = identify({ ...empty, sizeLevel: 7 }, [sparrow, { ...rareTwin, size_level: 7 }]);
    expect(r[0].species.species_id).toBe("twin");
  });
});

describe("表示する候補の絞り込み（pickTop）", () => {
  const show = (obs: Observation) => pickTop(identify(obs, species)).map((c) => c.species.name_ja);
  it("最大3件まで", () => {
    expect(show({ ...empty, sizeLevel: 2 }).length).toBeLessThanOrEqual(MAX_SHOWN);
    expect(show({ ...empty, sizeLevel: 2 }).length).toBe(MAX_SHOWN);
  });
  it("当てはまる鳥が1種だけなら1件だけ出す（ホーホケキョ → ウグイス）", () => {
    expect(show({ ...empty, onomatopoeia: "ホーホケキョ" })).toEqual(["ウグイス"]);
  });
  it("どの鳥にも当てはまらなければ0件", () => {
    expect(show({ ...empty, onomatopoeia: "ゾゾゾゾ" })).toEqual([]);
  });
  it("未入力なら0件", () => {
    expect(show(empty)).toEqual([]);
  });
  it("事前情報（よく見る鳥）だけでは表示されない", () => {
    const r = pickTop(identify({ ...empty, onomatopoeia: "ゾゾゾゾ" }, species));
    expect(r).toEqual([]);
  });
  it("典型入力では期待する鳥が3件に入る（アオサギ）", () => {
    expect(show({ ...empty, sizeLevel: 7, colors: ["gray"], place: "water" })).toContain("アオサギ");
  });
});

describe("補助関数", () => {
  it("月→季節", () => {
    expect([1, 4, 7, 11].map(monthToSeason)).toEqual(["winter", "spring", "summer", "autumn"]);
  });
  it("オノマトペ類似度", () => {
    expect(voiceSimilarity("チチチ", "チチッ")).toBeGreaterThan(0.4);
    expect(voiceSimilarity("カーカー", "ホーホケキョ")).toBe(0);
  });
});
