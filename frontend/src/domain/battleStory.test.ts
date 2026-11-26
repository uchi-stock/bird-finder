import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json";
import { SIZES, SPECIES } from "../options";
import type { Species } from "./types";
import { buildStory, motionOf } from "./battleStory";

const all = speciesJson as Species[];
const byId = (id: string) => all.find((s) => s.species_id === id) as Species;

describe("buildStory: 勝ち負けの無い、特徴を生かした物語", () => {
  const mine = byId("sparrow");
  const opp = byId("grey_heron");

  it("6つの場面（出会い・大きさ・めずらしさ・動き・声・おわり）を、この順で作る。同じ入力なら、同じ物語", () => {
    const story = buildStory(mine, opp);
    expect(story.map((s) => s.id)).toEqual(["meet", "size", "rarity", "move", "voice", "end"]);
    expect(buildStory(mine, opp)).toEqual(story);
  });

  it("勝ち負けを付けない（「勝った」「負けた」の表現が無く、おわりは、勝ち負けなく帰る）", () => {
    for (const a of all) {
      const text = buildStory(a, opp).map((s) => s.text).join("");
      expect(text).not.toMatch(/勝った|負けた|倒した|倒れた|やっつけ/);
    }
    expect(buildStory(mine, opp).at(-1)?.text).toContain("勝ち負けなく");
  });

  it("大きさの場面は、データの大きさ（段階・目安）から、どちらが大きいかを言う。同じ大きさなら、同じと言う", () => {
    const size = buildStory(mine, opp)[1].text;
    expect(size).toContain(`${opp.name_ja}のほうが、${opp.size_level - mine.size_level}段階大きい`);
    expect(buildStory(opp, mine)[1].text).toContain(`${opp.name_ja}のほうが、${opp.size_level - mine.size_level}段階大きい`);
    expect(buildStory(mine, mine)[1].text).toContain("同じくらいの大きさ");
  });

  it("大きさの目安の文言は、画面の大きさの選択（SIZES）と一致する", () => {
    for (const s of SIZES) {
      const sp = { ...mine, size_level: s.level } as Species;
      expect(buildStory(sp, mine)[1].text).toContain(`${s.ref}くらい（${s.cm}）`);
    }
  });

  it("出会いは、同じ環境なら、共通の環境で出会う。環境が違うなら、それぞれの環境を言う", () => {
    const same = { ...mine, habitats: ["waterside"] } as Species;
    const other = { ...opp, habitats: ["waterside", "open"] } as Species;
    expect(buildStory(same, other)[0].text).toContain("どちらも「川辺・水辺」");
    const diff = { ...opp, habitats: ["woodland"] } as Species;
    expect(buildStory(same, diff)[0].text).toContain("別の場所");
  });

  it("鳴き声の場面は、普段鳴かない鳥は鳴かないと言い、鳴く鳥はデータのオノマトペを出す", () => {
    const silent = { ...opp, silent: true } as Species;
    const voice = buildStory(mine, silent)[4].text;
    expect(voice).toContain("ほとんど鳴かない");
    expect(voice).toContain(`「${mine.onomatopoeia[0]}」`);
  });

  describe("めずらしさの場面（レア度と、見つけた回数）", () => {
    const rarity = (a: Species, b: Species, collection = {}) => buildStory(a, b, collection)[2].text;
    const entry = (count: number) => ({ firstAt: "2026-11-01T00:00:00.000Z", count });

    it("出現しやすさ（4段階）を、この地域での目安として言う", () => {
      const say = { very_common: "とてもよく見られる", common: "ふつうに見られる", uncommon: "あまり見られない", rare: "めったに見られない" } as const;
      for (const [abundance, text] of Object.entries(say)) {
        expect(rarity({ ...mine, abundance } as Species, opp)).toContain(`この地域で${abundance === "uncommon" || abundance === "rare" ? "は" : ""}、${text}`);
      }
    });

    it("見つけた回数: 1回ははじめて、複数回は回数を言う。相手は、未発見なら、まだ見つけていないと言う", () => {
      expect(rarity(mine, opp, { [mine.species_id]: entry(1) })).toContain("はじめて見つけた");
      expect(rarity(mine, opp, { [mine.species_id]: entry(7) })).toContain("7回、見つけている");
      expect(rarity(mine, opp, { [mine.species_id]: entry(1) })).toContain("あなたは、まだ見つけていない");
      expect(rarity(mine, opp, { [mine.species_id]: entry(1), [opp.species_id]: entry(3) })).toContain("あなたは、3回、見つけている");
    });

    it("めずらしい鳥（少ない・まれ）を見つけていたら、特別なことと言う。よく見られる鳥には言わない", () => {
      const rare = { ...mine, abundance: "rare" } as Species;
      expect(rarity(rare, opp, { [rare.species_id]: entry(1) })).toContain("見つけたことは、特別だ");
      const common = { ...mine, abundance: "very_common" } as Species;
      expect(rarity(common, opp, { [common.species_id]: entry(1) })).not.toContain("特別");
    });

    it("記録を渡さなくても、例外を投げず、物語になる（どちらも未発見として扱う）", () => {
      expect(buildStory(mine, opp)[2].text).toContain("まだ見つけていない");
    });
  });

  it("動きは、特徴に結びつく（飛ぶ→滑る、泳ぐ→浮かぶ、小さい→素早く、大きい→ゆっくり）。動きの場面だけ動かす", () => {
    expect(motionOf({ ...mine, behaviors: ["flying"] } as Species)).toBe("glide");
    expect(motionOf({ ...mine, behaviors: ["swimming"] } as Species)).toBe("float");
    expect(motionOf({ ...mine, behaviors: ["perching"], size_level: 2 } as Species)).toBe("sway-quick");
    expect(motionOf({ ...mine, behaviors: ["perching"], size_level: 6 } as Species)).toBe("sway-slow");
    const story = buildStory(mine, opp);
    expect(story.filter((s) => s.mine !== "still").map((s) => s.id)).toEqual(["move"]);
  });

  it("全種どうしで、例外を投げず、空の文章を作らない", () => {
    for (const a of SPECIES) {
      for (const b of SPECIES.slice(0, 6)) {
        for (const scene of buildStory(a, b)) expect(scene.text.length).toBeGreaterThan(5);
      }
    }
  });
});
