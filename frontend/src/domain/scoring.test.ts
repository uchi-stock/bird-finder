import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json";
import { hasAnyInput, identify, monthToSeason, voiceSimilarity } from "./scoring";
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
    const c = identify({ ...empty, onomatopoeia: "ゾゾゾゾ" }, species)[0];
    expect(c.score).toBe(0);
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
    expect(kite.score).toBeLessThan(0);
    expect(kite.score).toBeGreaterThan(-1);
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

describe("補助関数", () => {
  it("月→季節", () => {
    expect([1, 4, 7, 11].map(monthToSeason)).toEqual(["winter", "spring", "summer", "autumn"]);
  });
  it("オノマトペ類似度", () => {
    expect(voiceSimilarity("チチチ", "チチッ")).toBeGreaterThan(0.4);
    expect(voiceSimilarity("カーカー", "ホーホケキョ")).toBe(0);
  });
});
