export type Color = "brown" | "black" | "white" | "gray" | "blue" | "green" | "yellow" | "red";
export type Behavior = "swimming" | "wading" | "perching" | "flying" | "singing" | "foraging" | "preening";
export type Place = "feeder" | "ground" | "tree" | "wire" | "roof" | "water" | "grass" | "sky";
export type TimeSlot = "morning" | "day" | "evening" | "night";
export type Habitat = "waterside" | "urban" | "woodland" | "open";
export type Abundance = "very_common" | "common" | "uncommon" | "rare";
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface Species {
  species_id: string;
  name_ja: string;
  /** 学名（Wikimedia Commonsでの画像検索に使う） */
  scientific_name: string;
  size_level: number;
  /** 主な色（体の大部分を占める色） */
  colors: Color[];
  /** 部分的な色（体の一部にだけ見られる色） */
  colors_minor: Color[];
  behaviors: Behavior[];
  places: Place[];
  seasons: Season[];
  /** 活発に見られる時間帯（暫定値） */
  times: TimeSlot[];
  /** 普段は鳴き声が聞こえない（暫定値）。「鳴き声は聞こえなかった」の手がかりにする */
  silent?: boolean;
  /** 多摩川中流域での出現しやすさ（暫定値。識別確率ではない） */
  abundance: Abundance;
  /** 生息・観察されやすい環境（暫定値） */
  habitats: Habitat[];
  onomatopoeia: string[];
  note: string;
  source: string;
  confidence: string;
}

/** 未入力は undefined / 空配列で表す。「不明」と「不一致」は区別する */
export interface Observation {
  sizeLevel?: number;
  colors: Color[];
  behaviors: Behavior[];
  place?: Place;
  month?: number; // 1-12
  time?: TimeSlot;
  habitats: Habitat[];
  onomatopoeia: string;
  /** 鳴き声は聞こえなかった（オノマトペは無視する） */
  noVoice?: boolean;
}

export interface Candidate {
  species: Species;
  /** 内部の順位付け用。確率ではない */
  score: number;
  /** 入力項目だけで見た当てはまり具合（0〜1。事前情報は含まない）。表示するかの判断に使う */
  fit: number;
  maxScore: number;
  matching: string[];
  conflicting: string[];
  unknown: string[];
}
