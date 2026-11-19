import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json";
import { seededRng } from "./quiz";
import { buildSituationRound, cluesOf } from "./situationQuiz";
import type { Species } from "./types";

const SPECIES = speciesJson as Species[];

/** 手がかりの文面から、あてはまるかの判定を引く（全種の手がかりを集めて、文面で引き当てる） */
const holdsByText = new Map(SPECIES.flatMap((s) => cluesOf(s)).map((c) => [c.text, c.holds]));
const holdsAll = (s: Species, clues: string[]) => clues.every((t) => holdsByText.get(t)?.(s));

describe("状況クイズの出題（buildSituationRound）", () => {
  const rounds = Array.from({ length: 30 }, (_, i) => buildSituationRound(SPECIES, { rng: seededRng(i + 1) }));

  it("10問を作り、各問に手がかり3つと選択肢4つがある", () => {
    for (const round of rounds) {
      expect(round).toHaveLength(10);
      for (const q of round) {
        expect(q.kind).toBe("situation");
        expect(q.clues).toHaveLength(3);
        expect(new Set(q.choiceIds).size).toBe(4);
        expect(q.choiceIds).toContain(q.answerId);
      }
    }
  });

  it("正解は手がかりのすべてにあてはまり、誤答は少なくとも1つにあてはまらない（正解が必ず1つに決まる）", () => {
    const byId = new Map(SPECIES.map((s) => [s.species_id, s]));
    for (const round of rounds) {
      for (const q of round) {
        const holders = q.choiceIds.filter((id) => holdsAll(byId.get(id)!, q.clues ?? []));
        expect(holders).toEqual([q.answerId]);
      }
    }
  });

  it("手がかりの種類は、1つの問題で重ならない", () => {
    for (const q of rounds.flat()) {
      const kinds = (q.clues ?? []).map((t) => t.split(":")[0]);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it("同じ鳥が同じラウンドで2回、正解にならない", () => {
    for (const round of rounds) expect(new Set(round.map((q) => q.answerId)).size).toBe(round.length);
  });

  it("同じシードなら同じ問題になる", () => {
    expect(buildSituationRound(SPECIES, { rng: seededRng(7) })).toEqual(buildSituationRound(SPECIES, { rng: seededRng(7) }));
  });

  it("優先した鳥（間違えた鳥）が先に出題される", () => {
    const round = buildSituationRound(SPECIES, { rng: seededRng(3), prefer: ["sparrow", "japanese_bush_warbler"] });
    expect(round.slice(0, 2).map((q) => q.answerId).sort()).toEqual(["japanese_bush_warbler", "sparrow"]);
  });

  it("候補が選択肢の数に足りなければ、空を返す", () => {
    expect(buildSituationRound(SPECIES.slice(0, 3), { rng: seededRng(1) })).toEqual([]);
  });

  it("鳴き声の手がかりは、鳴く鳥にだけ出る（鳴き声の無い鳥には出ない）", () => {
    const silent = SPECIES.filter((s) => s.onomatopoeia.length === 0);
    for (const s of silent) expect(cluesOf(s).some((c) => c.kind === "voice")).toBe(false);
  });
});
