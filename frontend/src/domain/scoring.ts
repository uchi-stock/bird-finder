import type { Candidate, Observation, Season, Species } from "./types";

const WEIGHT = { size: 2, color: 2, behavior: 3, place: 3, season: 2, voice: 4 } as const;
const CONFLICT_PENALTY = 2;

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
    .replace(/[ー〜～ッっ\s、。・,.!！?？]/g, "");
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 0〜1。bigramのDice係数（1文字同士は一致/不一致） */
export function voiceSimilarity(a: string, b: string): number {
  const x = normalizeVoice(a);
  const y = normalizeVoice(b);
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

  // 色（選択数に比例させず、一致割合に正規化）
  if (obs.colors.length === 0) unknown.push("羽の色");
  else {
    maxScore += WEIGHT.color;
    const hit = obs.colors.filter((c) => sp.colors.includes(c)).length;
    if (hit > 0) {
      score += WEIGHT.color * (hit / obs.colors.length);
      matching.push("羽の色");
    } else {
      score -= CONFLICT_PENALTY;
      conflicting.push("羽の色");
    }
  }

  // 行動
  if (obs.behaviors.length === 0) unknown.push("行動");
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
      conflicting.push("行動（泳ぐ・水辺）");
    }
  }

  // 場所
  if (obs.place === undefined) unknown.push("見た場所");
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

  // 鳴き声（オノマトペ）。一致しなくても減点しない（聞き方の個人差が大きいため）
  if (!normalizeVoice(obs.onomatopoeia)) unknown.push("鳴き声");
  else {
    maxScore += WEIGHT.voice;
    const best = Math.max(...sp.onomatopoeia.map((o) => voiceSimilarity(obs.onomatopoeia, o)));
    if (best >= 0.4) {
      score += WEIGHT.voice * best;
      matching.push("鳴き声");
    }
  }

  return { species: sp, score, maxScore, matching, conflicting, unknown };
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
    normalizeVoice(obs.onomatopoeia) !== ""
  );
}
