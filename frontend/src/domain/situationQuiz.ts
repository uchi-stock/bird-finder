import { BEHAVIOR_LABEL, HABITAT_LABEL, PLACE_LABEL, SEASON_LABEL, TIME_LABEL } from "./labels";
import { shuffle, type QuizQuestion, type Rng } from "./quiz";
import type { Species } from "./types";

// 「状況を読んで、あてはまる鳥を選ぶ」クイズの出題（UI非依存の純粋関数）。
// 手がかり（季節・時間帯・環境・場所・行動・鳴き声）は、鳥のデータから自動で作る。
// 正解の鳥は手がかりのすべてにあてはまり、誤答の鳥は、少なくとも1つにあてはまらない（正解が必ず1つに決まる）

interface Clue {
  /** 手がかりの種類。1つの問題で、同じ種類は使わない */
  kind: "season" | "time" | "habitat" | "place" | "behavior" | "voice";
  text: string;
  holds: (s: Species) => boolean;
}

/** 鳥のデータから、その鳥にあてはまる手がかりを種類ごとに作る */
export function cluesOf(s: Species): Clue[] {
  const clues: Clue[] = [];
  for (const v of s.seasons) clues.push({ kind: "season", text: `季節: ${SEASON_LABEL[v]}`, holds: (x) => x.seasons.includes(v) });
  for (const v of s.times) clues.push({ kind: "time", text: `時間帯: ${TIME_LABEL[v]}`, holds: (x) => x.times.includes(v) });
  for (const v of s.habitats) clues.push({ kind: "habitat", text: `周辺の環境: ${HABITAT_LABEL[v]}`, holds: (x) => x.habitats.includes(v) });
  // 「見えない（声だけ）」は、状況の説明として不自然なため使わない
  for (const v of s.places.filter((p) => p !== "unseen")) clues.push({ kind: "place", text: `見かけた場所: ${PLACE_LABEL[v]}`, holds: (x) => x.places.includes(v) });
  for (const v of s.behaviors) clues.push({ kind: "behavior", text: `行動: ${BEHAVIOR_LABEL[v]}`, holds: (x) => x.behaviors.includes(v) });
  for (const v of s.onomatopoeia) clues.push({ kind: "voice", text: `鳴き声: 「${v}」`, holds: (x) => x.onomatopoeia.includes(v) });
  return clues;
}

export interface SituationOptions {
  rng: Rng;
  /** 出題数（既定10） */
  count?: number;
  /** 選択肢の数（既定4） */
  choices?: number;
  /** 手がかりの数（既定3。多いほど絞りやすく、易しい） */
  clueCount?: number;
  /** 優先して出題する鳥のID（復習用） */
  prefer?: readonly string[];
}

/** 手がかりの組み合わせを作る。種類はすべて異なり、鳴き声の手がかりは、鳴く鳥にだけ使う */
function pickClues(answer: Species, clueCount: number, rng: Rng): Clue[] {
  const byKind = new Map<Clue["kind"], Clue[]>();
  for (const c of cluesOf(answer)) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const kinds = shuffle([...byKind.keys()], rng).slice(0, clueCount);
  return kinds.map((k) => shuffle(byKind.get(k) ?? [], rng)[0]);
}

/**
 * 誤答は、手がかりに1つ以上あてはまらない鳥から選ぶ。手がかりにあてはまる数が多い（紛らわしい）鳥を優先する。
 * 足りなければ、undefined（この手がかりの組み合わせでは出題できない）
 */
function pickDistractors(answer: Species, clues: Clue[], candidates: readonly Species[], count: number, rng: Rng): Species[] | undefined {
  const failing = shuffle(
    candidates.filter((s) => s.species_id !== answer.species_id && clues.some((c) => !c.holds(s))),
    rng,
  );
  if (failing.length < count) return undefined;
  const held = (s: Species) => clues.filter((c) => c.holds(s)).length;
  // shuffle済みのため、同数のときの並びはランダム（安定ソート）
  return failing.sort((a, b) => held(b) - held(a)).slice(0, count);
}

const MAX_TRIES = 12;

/**
 * 1ラウンド分の状況問題を作る。candidatesは、写真を取得できた鳥だけを渡す。
 * 手がかりを作れない鳥・誤答を選べない鳥は出題せず、出題できる問題だけを返す（count未満のことがある）
 */
export function buildSituationRound(candidates: readonly Species[], { rng, count = 10, choices = 4, clueCount = 3, prefer = [] }: SituationOptions): QuizQuestion[] {
  if (candidates.length < choices) return [];
  const preferred = new Set(prefer);
  const answers = [
    ...shuffle(candidates.filter((s) => preferred.has(s.species_id)), rng),
    ...shuffle(candidates.filter((s) => !preferred.has(s.species_id)), rng),
  ];
  const questions: QuizQuestion[] = [];
  for (const answer of answers) {
    if (questions.length >= count) break;
    for (let t = 0; t < MAX_TRIES; t++) {
      const clues = pickClues(answer, clueCount, rng);
      if (clues.length < clueCount) break; // この鳥は、手がかりの種類が足りない
      const distractors = pickDistractors(answer, clues, candidates, choices - 1, rng);
      if (!distractors) continue;
      questions.push({
        kind: "situation",
        answerId: answer.species_id,
        choiceIds: shuffle([answer, ...distractors], rng).map((s) => s.species_id),
        clues: clues.map((c) => c.text),
      });
      break;
    }
  }
  return questions;
}
