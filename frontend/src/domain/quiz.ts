import type { Species } from "./types";

// クイズの出題と選択肢の生成（UI非依存の純粋関数）。乱数は、シードを渡せる形にして、テストで再現できるようにする

/** 問題の種類: 名前を見て写真から選ぶ／鳴き声を聞いて写真から選ぶ／状況を読んで写真から選ぶ／写真を見て鳴き声から選ぶ */
export type QuizKind = "name" | "call" | "situation" | "photoCall";

export interface QuizQuestion {
  kind: QuizKind;
  /** 正解の鳥のID */
  answerId: string;
  /** 選択肢の鳥のID（正解を1つ含む。並びはシャッフル済み） */
  choiceIds: string[];
  /** 状況の問題で出す手がかり（例「季節: 冬」）。正解の鳥は、すべてにあてはまる */
  clues?: string[];
}

export type Rng = () => number;

/** シードから再現できる乱数（mulberry32）。0以上1未満を返す */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 誤答の選び方で、難易度が決まる。見分けにくい鳥（similar）→同じ科→大きさが近い鳥（size_levelの差が1以下）の順に選ぶ。
 * 似た鳥どうしのほうが、覚える効果が高い。足りないときは、大きさの近い順に全体から補う
 */
function pickDistractors(answer: Species, candidates: readonly Species[], count: number, rng: Rng): Species[] {
  const others = shuffle(candidates.filter((s) => s.species_id !== answer.species_id), rng);
  const picked: Species[] = [];
  const take = (list: readonly Species[]) => {
    for (const s of list) if (picked.length < count && !picked.includes(s)) picked.push(s);
  };
  take(others.filter((s) => answer.similar?.includes(s.species_id)));
  take(others.filter((s) => s.family && s.family === answer.family));
  take(others.filter((s) => Math.abs(s.size_level - answer.size_level) <= 1));
  if (picked.length < count) {
    take(others.sort((a, b) => Math.abs(a.size_level - answer.size_level) - Math.abs(b.size_level - answer.size_level)));
  }
  return picked;
}

export interface RoundOptions {
  rng: Rng;
  /** 出題数（既定10）。出題できる鳥が少なければ、その数まで */
  count?: number;
  /** 問題の種類（既定: name）。出題の仕組みは共通で、画面が種類ごとの表示を切り替える */
  kind?: QuizKind;
  /** 選択肢の数（既定4） */
  choices?: number;
  /** 優先して出題する鳥のID（復習用。間違えた鳥） */
  prefer?: readonly string[];
}

/**
 * 1ラウンド分の問題を作る。candidatesは、写真を取得できた鳥だけを渡す（写真が無い鳥は出題しない）。
 * 選択肢の数に足りないときは、空の配列を返す。同じ鳥が同じラウンドで2回、正解になることはない
 */
export function buildRound(candidates: readonly Species[], { rng, count = 10, choices = 4, prefer = [], kind = "name" }: RoundOptions): QuizQuestion[] {
  if (candidates.length < choices) return [];
  const preferred = new Set(prefer);
  const first = shuffle(candidates.filter((s) => preferred.has(s.species_id)), rng);
  const rest = shuffle(candidates.filter((s) => !preferred.has(s.species_id)), rng);
  const answers = [...first, ...rest].slice(0, Math.min(count, candidates.length));
  return answers.map((answer) => ({
    kind,
    answerId: answer.species_id,
    choiceIds: shuffle([answer, ...pickDistractors(answer, candidates, choices - 1, rng)], rng).map((s) => s.species_id),
  }));
}
