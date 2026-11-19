import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json";
import { MAX_SHOWN, hasAnyInput, identify, monthToSeason, normalizeVoice, pickTop, repeatUnit, scoreSpecies, voiceSimilarity } from "./scoring";
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
  it("最大4件まで", () => {
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

describe("鳴き声が聞こえなかった／コウモリ", () => {
  it("聞こえなかった場合、普段聞こえない種だけが加点され、鳴く鳥は減点されない", () => {
    const r = identify({ ...empty, noVoice: true }, species);
    const bat = r.find((c) => c.species.species_id === "pipistrelle_bat")!;
    const lark = r.find((c) => c.species.name_ja === "ウグイス")!;
    expect(bat.matching).toContain("鳴き声（聞こえない）");
    expect(lark.score).toBeLessThanOrEqual(1); // 事前情報のみ
    expect(lark.conflicting).toHaveLength(0);
    expect(r[0].species.silent).toBe(true);
  });
  it("入力が「聞こえなかった」だけでも候補を出す（聞こえない種のみ）", () => {
    const names = pickTop(identify({ ...empty, noVoice: true }, species)).map((c) => c.species.name_ja);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => ["アブラコウモリ", "カワウ", "ダイサギ"].includes(n))).toBe(true);
    expect(hasAnyInput({ ...empty, noVoice: true })).toBe(true);
  });
  it("夕方・空・小型・聞こえない → アブラコウモリが1位", () => {
    const r = identify({ ...empty, sizeLevel: 1, place: "sky", time: "evening", month: 6, behaviors: ["flying"], noVoice: true }, species);
    expect(r[0].species.name_ja).toBe("アブラコウモリ");
  });
  it("昼間の鳥の観察ではコウモリは上位に来ない", () => {
    const r = identify({ ...empty, time: "morning", place: "tree", behaviors: ["singing"], onomatopoeia: "ホーホケキョ" }, species);
    expect(r[0].species.name_ja).toBe("ウグイス");
  });
});

describe("羽の色の2段階（主な色・部分的な色）", () => {
  const score = (obs: Observation, name: string) => identify(obs, species).find((c) => c.species.name_ja === name)!;
  it("黒・白を選んでも、茶が主なスズメより、白黒が主なハクセキレイが上位", () => {
    const obs: Observation = { ...empty, colors: ["black", "white"] };
    expect(score(obs, "ハクセキレイ").score).toBeGreaterThan(score(obs, "スズメ").score);
  });
  it("スズメは黒・白が部分的な色なので「羽の色（一部）」と表示される", () => {
    const c = score({ ...empty, colors: ["black", "white"] }, "スズメ");
    expect(c.matching).toContain("羽の色（一部）");
    expect(c.conflicting).not.toContain("羽の色");
  });
  it("茶を選べばスズメは主な色で一致し、「羽の色」と表示される", () => {
    const c = score({ ...empty, colors: ["brown"] }, "スズメ");
    expect(c.matching).toContain("羽の色");
  });
  it("部分的な色のみの一致は、主な色の一致より点が低い", () => {
    const main = score({ ...empty, colors: ["brown"] }, "スズメ").score;
    const minor = score({ ...empty, colors: ["black"] }, "スズメ").score;
    expect(minor).toBeLessThan(main);
    expect(minor).toBeGreaterThan(0);
  });
  it("どちらの色にも無ければ従来どおり矛盾", () => {
    expect(score({ ...empty, colors: ["blue"] }, "スズメ").conflicting).toContain("羽の色");
  });
  it("全種が主な色を持ち、部分的な色と重ならない", () => {
    for (const s of species) {
      expect(s.colors.length).toBeGreaterThan(0);
      expect(s.colors_minor.filter((c) => s.colors.includes(c))).toEqual([]);
    }
  });
});

describe("行動の整理（泳ぐ／水の中に立つ・歩く／止まる・立つ・歩く）", () => {
  const by = (obs: Observation, name: string) => identify(obs, species).find((c) => c.species.name_ja === name)!;
  it("水の中に立つ・歩くは、サギ類・シギ類が一致する", () => {
    for (const n of ["アオサギ", "ダイサギ", "コサギ", "イソシギ", "コチドリ"]) {
      expect(by({ ...empty, behaviors: ["wading"] }, n).matching, n).toContain("行動");
    }
  });
  it("水の中に立つ・歩くは、泳ぐカモ類（カイツブリ）では一致しない", () => {
    expect(by({ ...empty, behaviors: ["wading"] }, "カイツブリ").matching).not.toContain("行動");
  });
  it("セキレイ類は泳がない（泳ぐを選ぶと矛盾）が、止まる・立つ・歩くは一致する", () => {
    expect(by({ ...empty, behaviors: ["swimming"] }, "ハクセキレイ").conflicting).toContain("行動（泳ぐ）");
    expect(by({ ...empty, behaviors: ["perching"] }, "ハクセキレイ").matching).toContain("行動");
  });
  it("泳ぐは、カモ類・カイツブリ・オオバンが一致する", () => {
    for (const n of ["カルガモ", "カイツブリ", "オオバン"]) expect(by({ ...empty, behaviors: ["swimming"] }, n).matching, n).toContain("行動");
  });
  it("地上を歩く鳥は止まる・立つ・歩くに一致する（ムクドリ・ハト・ツグミ）", () => {
    for (const n of ["ムクドリ", "ドバト", "ツグミ"]) expect(by({ ...empty, behaviors: ["perching"] }, n).matching, n).toContain("行動");
  });
  it("水辺・水の中に立つ・歩く → サギ類が上位3件に入る", () => {
    const names = pickTop(identify({ ...empty, place: "water", habitats: ["waterside"], behaviors: ["wading"] }, species)).map((c) => c.species.name_ja);
    expect(names.some((n) => ["アオサギ", "ダイサギ", "コサギ"].includes(n))).toBe(true);
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

describe("声の比較の改善（#78）", () => {
  it("小さい仮名・半濁音と濁音の書き方の違いを同じとみなす", () => {
    expect(normalizeVoice("グェッ")).toBe(normalizeVoice("ぐえっ"));
    expect(normalizeVoice("ちゅぴちゅぴ")).toBe(normalizeVoice("チュビチュビ"));
  });
  it("繰り返しの単位を取り出す（2文字以上）", () => {
    expect(repeatUnit("ピリピリ")).toBe("ピリ");
    expect(repeatUnit("チチチ")).toBe("チチチ");
    expect(repeatUnit("ホホケキヨ")).toBe("ホホケキヨ");
  });
  it("繰り返しの回数が違っても一致とみなす", () => {
    expect(voiceSimilarity("ぴりっ ぴりっ", "ピリッ")).toBe(1);
    expect(voiceSimilarity("ちゅんちゅんちゅん", "チュンチュン")).toBe(1);
  });
  it("複数の聞こえ方を書いたときは、区切りごとにも比べる（全体の一致より少し弱く扱う）", () => {
    const part = voiceSimilarity("きーきー ぎゃー", "ギャーギャー");
    expect(part).toBeGreaterThan(0.8);
    expect(part).toBeLessThan(1);
    expect(voiceSimilarity("ひっひっ かっかっ", "ヒッヒッカッカッ")).toBe(1);
  });
});

describe("声だけの入力の改善（#78）", () => {
  const base = { colors: [], habitats: [], onomatopoeia: "" } as const;
  const find = (id: string) => (speciesJson as Species[]).find((s) => s.species_id === id)!;
  it("見えない（声だけ）のときは、自動で入る「鳴く」を採点しない", () => {
    const duck = find("mallard"); // 行動のデータに「鳴く」を持たない
    const c = scoreSpecies({ ...base, colors: [], habitats: [], place: "unseen", behaviors: ["singing"], onomatopoeia: "ぐえっ" }, duck);
    expect(c.unknown).toContain("行動");
    expect(c.matching).toContain("鳴き声");
    expect(c.fit).toBeGreaterThanOrEqual(0.5);
  });
  it("普段ほとんど声を出さない種は、声が聞こえたときに声の一致で加点しない", () => {
    const cormorant = find("great_cormorant");
    const c = scoreSpecies({ ...base, colors: [], habitats: [], behaviors: [], onomatopoeia: "グワッ" }, cormorant);
    expect(c.matching).not.toContain("鳴き声");
  });
});
