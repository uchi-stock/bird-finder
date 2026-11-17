import { describe, expect, it } from "vitest";
import { buildRound, seededRng } from "./quiz";
import type { Species } from "./types";

const sp = (id: string, size: number) => ({ species_id: id, name_ja: id, size_level: size }) as Species;
const POOL = [sp("a", 1), sp("b", 2), sp("c", 2), sp("d", 3), sp("e", 3), sp("f", 4), sp("g", 5), sp("h", 6), sp("i", 7), sp("j", 7), sp("k", 7), sp("l", 2)];

describe("buildRound", () => {
  it("既定で10問。各問は選択肢4つで、正解がちょうど1つ入り、選択肢に重複が無い", () => {
    const round = buildRound(POOL, { rng: seededRng(1) });
    expect(round).toHaveLength(10);
    for (const q of round) {
      expect(q.choiceIds).toHaveLength(4);
      expect(new Set(q.choiceIds).size).toBe(4);
      expect(q.choiceIds.filter((id) => id === q.answerId)).toHaveLength(1);
    }
  });

  it("同じ鳥が正解になるのは、1ラウンドに1回だけ", () => {
    const answers = buildRound(POOL, { rng: seededRng(2) }).map((q) => q.answerId);
    expect(new Set(answers).size).toBe(answers.length);
  });

  it("出題できる鳥が出題数より少なければ、その数まで。選択肢に足りなければ空", () => {
    expect(buildRound(POOL.slice(0, 6), { rng: seededRng(3) })).toHaveLength(6);
    expect(buildRound(POOL.slice(0, 3), { rng: seededRng(3) })).toEqual([]);
  });

  it("写真の無い鳥（candidatesに無い鳥）は、正解にも選択肢にも出ない", () => {
    const candidates = POOL.slice(0, 8);
    const allowed = new Set(candidates.map((s) => s.species_id));
    for (const q of buildRound(candidates, { rng: seededRng(4) })) for (const id of q.choiceIds) expect(allowed.has(id)).toBe(true);
  });

  it("誤答は、大きさが近い鳥（差が1以下）から選ばれる。足りないときは全体から補う", () => {
    const round = buildRound(POOL, { rng: seededRng(5), count: 12 });
    const size = (id: string) => POOL.find((s) => s.species_id === id)!.size_level;
    const near = round.find((q) => q.answerId === "b")!; // 大きさ2の鳥は、近い鳥が十分にある
    for (const id of near.choiceIds) expect(Math.abs(size(id) - 2)).toBeLessThanOrEqual(1);
    const big = round.find((q) => q.answerId === "i")!; // 大きさ7の鳥は、近い鳥が少ないので補う
    expect(big.choiceIds).toHaveLength(4);
  });

  it("同じシードなら、同じ問題になる。違うシードなら変わる", () => {
    const a = buildRound(POOL, { rng: seededRng(6) });
    expect(buildRound(POOL, { rng: seededRng(6) })).toEqual(a);
    expect(buildRound(POOL, { rng: seededRng(7) })).not.toEqual(a);
  });

  it("復習では、優先する鳥（間違えた鳥）が先に出る", () => {
    const round = buildRound(POOL, { rng: seededRng(8), count: 3, prefer: ["i", "j", "k"] });
    expect(round.map((q) => q.answerId).sort()).toEqual(["i", "j", "k"]);
  });
});

describe("seededRng", () => {
  it("0以上1未満を返し、同じシードで再現する", () => {
    const r = seededRng(9);
    const values = Array.from({ length: 100 }, () => r());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const r2 = seededRng(9);
    expect(Array.from({ length: 100 }, () => r2())).toEqual(values);
  });
});
