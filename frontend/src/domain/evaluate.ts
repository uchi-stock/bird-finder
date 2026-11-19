import { identify, pickTop } from "./scoring";
import type { Observation, Species } from "./types";

// 識別精度の評価。想定した入力（evalScenarios.json）に対して、正解の鳥が候補に出るかを数える。
// 画面と同じ経路（identify → pickTop）で判定する

export interface Scenario {
  id: string;
  /** voice: 声だけ分かる / sight: 姿だけ分かる */
  kind: "voice" | "sight";
  expected: string;
  observation: Observation;
  note?: string;
}

export interface Miss {
  id: string;
  expected: string;
  got: string[];
}

export interface EvalResult {
  total: number;
  /** 正解が1番目に出た割合（0〜1） */
  top1: number;
  /** 正解が表示される候補（最大4件）に入った割合（0〜1） */
  top3: number;
  /** 正解が候補に入らなかったシナリオ */
  misses: Miss[];
  /** 候補には入ったが、1番目ではなかったシナリオ */
  notFirst: Miss[];
}

export function evaluate(scenarios: Scenario[], species: Species[]): EvalResult {
  const misses: Miss[] = [];
  const notFirst: Miss[] = [];
  let first = 0;
  for (const s of scenarios) {
    const got = pickTop(identify(s.observation, species)).map((c) => c.species.species_id);
    if (got[0] === s.expected) first++;
    else if (got.includes(s.expected)) notFirst.push({ id: s.id, expected: s.expected, got });
    else misses.push({ id: s.id, expected: s.expected, got });
  }
  const total = scenarios.length;
  return { total, top1: total ? first / total : 0, top3: total ? (total - misses.length) / total : 0, misses, notFirst };
}
