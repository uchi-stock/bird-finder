import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json";
import scenariosJson from "./evalScenarios.json";
import { evaluate, type Scenario } from "./evaluate";
import type { Species } from "./types";

const species = speciesJson as Species[];
const scenarios = scenariosJson as Scenario[];

// 精度の下限。重みやデータを変えて精度が下がったら、ここで気づく。
// 上がったら、実測値に合わせて下限を引き上げる（docs/accuracy.mdも更新する）。
// 実測値（2026-11-16）: 全体 top1 54.5% / top3 77.3%、声だけ top1 41.5% / top3 70.7%、姿だけ top1 66.0% / top3 83.0%
const MIN_TOP1 = 0.51;
const MIN_TOP3 = 0.75;

describe("evaluate", () => {
  it("正解が1番目・候補内・候補外のどれかを数える", () => {
    const pick = (id: string) => scenarios.find((s) => s.id === id)!;
    const r = evaluate([pick("great_egret-sight"), pick("japanese_bush_warbler-voice")], species);
    expect(r.total).toBe(2);
    expect(r.top1).toBe(1);
    expect(r.top3).toBe(1);
    expect(r.misses).toEqual([]);
    const wrong = evaluate([{ ...pick("great_egret-sight"), expected: "sparrow" }], species);
    expect(wrong.top3).toBe(0);
    expect(wrong.misses[0].expected).toBe("sparrow");
  });
  it("シナリオが空なら0を返す", () => {
    expect(evaluate([], species)).toMatchObject({ total: 0, top1: 0, top3: 0 });
  });
});

describe("評価シナリオ", () => {
  it("すべての鳥に2件以上あり、正解のIDが実在する", () => {
    const ids = new Set(species.map((s) => s.species_id));
    const count = new Map<string, number>();
    for (const s of scenarios) {
      expect(ids.has(s.expected), s.id).toBe(true);
      count.set(s.expected, (count.get(s.expected) ?? 0) + 1);
    }
    for (const id of ids) expect(count.get(id) ?? 0, id).toBeGreaterThanOrEqual(2);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });
});

describe("識別精度（回帰の検知）", () => {
  const r = evaluate(scenarios, species);
  const list = (m: typeof r.misses) => m.map((x) => `${x.id} → ${x.got.join(",")}`).join("\n");
  it(`候補（最大3件）に正解が入る割合が${MIN_TOP3 * 100}%以上`, () => {
    expect(r.top3, `候補に入らなかったシナリオ:\n${list(r.misses)}`).toBeGreaterThanOrEqual(MIN_TOP3);
  });
  it(`正解が1番目に出る割合が${MIN_TOP1 * 100}%以上`, () => {
    expect(r.top1, `1番目ではなかったシナリオ:\n${list(r.notFirst)}`).toBeGreaterThanOrEqual(MIN_TOP1);
  });
});
