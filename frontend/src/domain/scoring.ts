import type { Abundance, Candidate, Observation, Season, Species } from "./types";

const WEIGHT = { size: 2, color: 2, behavior: 3, place: 3, season: 2, time: 1, habitat: 2, voice: 4 } as const;
const CONFLICT_PENALTY = 2;
/** 部分的な色だけが一致した場合の重み（主な色は1） */
const MINOR_COLOR = 0.3;
/** 地域での出現しやすさによる加点（事前情報）。入力一致の重みより小さくし、少ないことを理由に減点・除外はしない */
const PRIOR: Record<Abundance, number> = { very_common: 1, common: 0.7, uncommon: 0.3, rare: 0 };

export function monthToSeason(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/** ひらがな→カタカナ、長音・促音・空白を除去して比較しやすくする */
export function normalizeVoice(s: string): string {
  return s
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[ー〜～ッっ\s、。・,.!！?？]/g, "")
    // 「グェ」と「グエ」のような、小さい仮名の書き方の違いを同じとみなす
    .replace(/[ァィゥェォャュョヮ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 1))
    // 「チュピ」と「チュビ」のような、半濁音と濁音の聞こえ方の違いを同じとみなす
    .replace(/[パピプペポ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 1));
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 0〜1。bigramのDice係数（1文字同士は一致/不一致） */
function dice(x: string, y: string): number {
  if (!x || !y) return 0;
  if (x.length === 1 || y.length === 1) return x === y ? 1 : x.includes(y) || y.includes(x) ? 0.5 : 0;
  const bx = bigrams(x);
  const by = bigrams(y);
  const pool = [...by];
  let hit = 0;
  for (const g of bx) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      hit++;
      pool.splice(i, 1);
    }
  }
  return (2 * hit) / (bx.length + by.length);
}

/** 「ピリピリ」のような繰り返しなら、繰り返しの単位（2文字以上）を返す。繰り返しでなければそのまま返す */
export function repeatUnit(s: string): string {
  for (let len = 2; len <= s.length / 2; len++) {
    if (s.length % len === 0 && s.slice(0, len).repeat(s.length / len) === s) return s.slice(0, len);
  }
  return s;
}

/** 繰り返しの回数の違い（「ピリッ」と「ピリピリ」）で一致度が下がらないよう、繰り返しの単位でも比べる */
function phraseSimilarity(x: string, y: string): number {
  const ux = repeatUnit(x);
  const uy = repeatUnit(y);
  return Math.max(dice(x, y), ux !== x || uy !== y ? dice(ux, uy) : 0);
}

const PART_MATCH = 0.85;

/**
 * 0〜1。聞こえた声と、鳥の声の表記の近さ。
 * 空白や読点で区切って複数の聞こえ方を書いた場合（「きーきー ぎゃー」）は、全体と、区切りごとの、最も近いものを使う
 */
export function voiceSimilarity(a: string, b: string): number {
  const y = normalizeVoice(b);
  const whole = normalizeVoice(a);
  if (!whole || !y) return 0;
  const parts = a.split(/[\s、。・,.!！?？]+/).map(normalizeVoice).filter((p) => p.length >= 2);
  // 一部だけの一致は、全体の一致より少し弱い手がかりとして扱う
  return Math.max(phraseSimilarity(whole, y), ...parts.map((p) => PART_MATCH * phraseSimilarity(p, y)));
}

export function scoreSpecies(obs: Observation, sp: Species): Candidate {
  let score = 0;
  let maxScore = 0;
  const matching: string[] = [];
  const conflicting: string[] = [];
  const unknown: string[] = [];

  // 大きさ（隣接レベルは部分一致、3段階以上離れると矛盾）
  if (obs.sizeLevel === undefined) unknown.push("大きさ");
  else {
    maxScore += WEIGHT.size;
    const diff = Math.abs(obs.sizeLevel - sp.size_level);
    if (diff === 0) {
      score += WEIGHT.size;
      matching.push("大きさ");
    } else if (diff === 1) {
      score += WEIGHT.size / 2;
      matching.push("大きさ（近い）");
    } else if (diff >= 3) {
      score -= CONFLICT_PENALTY;
      conflicting.push("大きさ");
    }
  }

  // 色（選択数に比例させず平均。主な色は1、部分的な色は少しだけ加点する）
  if (obs.colors.length === 0) unknown.push("羽の色");
  else {
    maxScore += WEIGHT.color;
    const part: number[] = obs.colors.map((c) => (sp.colors.includes(c) ? 1 : sp.colors_minor.includes(c) ? MINOR_COLOR : 0));
    const ratio = part.reduce((a, b) => a + b, 0) / obs.colors.length;
    if (ratio > 0) {
      score += WEIGHT.color * ratio;
      matching.push(part.some((p) => p === 1) ? "羽の色" : "羽の色（一部）");
    } else {
      score -= CONFLICT_PENALTY;
      conflicting.push("羽の色");
    }
  }

  // 行動
  // 姿が見えない（声だけ）ときの「鳴く」は自動で入る選択で、声が聞こえた以上の手がかりにならないので採点しない
  if (obs.behaviors.length === 0 || obs.place === "unseen") unknown.push("行動");
  else {
    maxScore += WEIGHT.behavior;
    const hit = obs.behaviors.filter((b) => sp.behaviors.includes(b)).length;
    if (hit > 0) {
      score += WEIGHT.behavior * (hit / obs.behaviors.length);
      matching.push("行動");
    }
    // 泳いでいたのに泳がない鳥は明確な矛盾
    if (obs.behaviors.includes("swimming") && !sp.behaviors.includes("swimming")) {
      score -= CONFLICT_PENALTY;
      conflicting.push("行動（泳ぐ）");
    }
  }

  // 場所
  // 見えない（声だけ）は場所の手がかりがないので、未入力と同じく加点も減点もしない
  if (obs.place === undefined || obs.place === "unseen") unknown.push("見た場所");
  else {
    maxScore += WEIGHT.place;
    if (sp.places.includes(obs.place)) {
      score += WEIGHT.place;
      matching.push("見た場所");
    } else if (obs.place === "water") {
      score -= CONFLICT_PENALTY;
      conflicting.push("見た場所（水辺）");
    }
  }

  // 季節（矛盾しても除外はしない）
  if (obs.month === undefined) unknown.push("季節");
  else {
    maxScore += WEIGHT.season;
    if (sp.seasons.includes(monthToSeason(obs.month))) {
      score += WEIGHT.season;
      matching.push("季節");
    } else {
      score -= CONFLICT_PENALTY / 2;
      conflicting.push("季節");
    }
  }

  // 周辺環境（一致のみ加点。不一致は減点しない：環境判定は誤差が大きいため）
  if (obs.habitats.length === 0) unknown.push("周辺環境");
  else {
    maxScore += WEIGHT.habitat;
    const hit = obs.habitats.filter((h) => sp.habitats.includes(h)).length;
    if (hit > 0) {
      score += WEIGHT.habitat * (hit / obs.habitats.length);
      matching.push("周辺環境");
    }
  }

  // 時間帯（不一致は軽い減点のみ。除外しない）
  if (obs.time === undefined) unknown.push("時間帯");
  else {
    maxScore += WEIGHT.time;
    if (sp.times.includes(obs.time)) {
      score += WEIGHT.time;
      matching.push("時間帯");
    } else {
      score -= CONFLICT_PENALTY / 4;
      conflicting.push("時間帯");
    }
  }

  // 鳴き声。聞こえなかった場合は、普段聞こえない種だけ加点する（鳴く鳥も静かなことがあるため減点しない）。
  // オノマトペは一致しなくても減点しない（聞き方の個人差が大きいため）
  if (obs.noVoice) {
    maxScore += WEIGHT.voice;
    if (sp.silent) {
      score += WEIGHT.voice;
      matching.push("鳴き声（聞こえない）");
    }
  } else if (!normalizeVoice(obs.onomatopoeia)) unknown.push("鳴き声");
  else {
    maxScore += WEIGHT.voice;
    // 普段ほとんど声を出さない種は、声が聞こえたときの候補にしない（声の一致で加点しない）
    const best = sp.silent ? 0 : Math.max(0, ...sp.onomatopoeia.map((o) => voiceSimilarity(obs.onomatopoeia, o)));
    if (best >= 0.4) {
      score += WEIGHT.voice * best;
      matching.push("鳴き声");
    }
  }

  const inputMax = maxScore;
  const inputScore = score;

  // 地域での出現しやすさ（入力が1つでもあるときだけ加点する）
  if (hasAnyInput(obs)) {
    maxScore += PRIOR.very_common;
    score += PRIOR[sp.abundance];
    if (sp.abundance === "very_common" || sp.abundance === "common") matching.push("地域でよく見られる");
  }

  const fit = inputMax > 0 ? Math.max(0, inputScore / inputMax) : 0;
  return { species: sp, score, fit, maxScore, matching, conflicting, unknown };
}

/** 何か1つでも入力があれば、全種をスコア順に返す（候補から除外はしない） */
export function identify(obs: Observation, all: Species[]): Candidate[] {
  return all
    .map((sp) => scoreSpecies(obs, sp))
    .sort((a, b) => b.score - a.score || a.species.name_ja.localeCompare(b.species.name_ja, "ja"));
}

export function hasAnyInput(obs: Observation): boolean {
  return (
    obs.sizeLevel !== undefined ||
    obs.colors.length > 0 ||
    obs.behaviors.length > 0 ||
    obs.place !== undefined ||
    obs.month !== undefined ||
    obs.time !== undefined ||
    obs.habitats.length > 0 ||
    obs.noVoice === true ||
    normalizeVoice(obs.onomatopoeia) !== ""
  );
}

/** 表示する最大件数と、表示する最低ライン（入力項目の当てはまり具合） */
export const MAX_SHOWN = 3;
export const MIN_FIT = 0.5;

/** 当てはまりが弱い鳥は表示せず、上位MAX_SHOWN件まで返す（0〜3件）。除外は表示上のみで、スコア計算には影響しない */
export function pickTop(sorted: Candidate[]): Candidate[] {
  return sorted.filter((c) => c.fit >= MIN_FIT && c.matching.some((m) => m !== "地域でよく見られる")).slice(0, MAX_SHOWN);
}
