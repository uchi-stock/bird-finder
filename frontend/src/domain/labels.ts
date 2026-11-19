import type { Behavior, Habitat, Place, Season, TimeSlot } from "./types";

// 選択肢の表示名。画面（App.tsx）と、ドキュメントの図（choicesDiagram.ts）の両方で使い、ずれを防ぐ
export const HABITAT_LABEL: Record<Habitat, string> = {
  waterside: "川辺・水辺",
  urban: "住宅街・市街地",
  woodland: "森・林・公園",
  open: "草地・農地",
};

export const PLACE_LABEL: Record<Place, string> = {
  feeder: "餌台",
  ground: "地面の上",
  tree: "木や茂みの中",
  wire: "柵や電線の上",
  roof: "建物や屋根の上",
  water: "水辺・水面",
  grass: "草むら・ヨシ原",
  sky: "空（飛んでいた）",
  unseen: "見えない（声だけ）",
};

export const BEHAVIOR_LABEL: Record<Behavior, string> = {
  swimming: "泳ぐ",
  wading: "水の中に立つ・歩く",
  perching: "止まる・立つ・歩く",
  flying: "飛ぶ・滑空する",
  singing: "鳴く・歌う",
  foraging: "採食する・つつく",
  preening: "羽繕いする",
};

export const SEASON_LABEL: Record<Season, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

export const TIME_LABEL: Record<TimeSlot, string> = { morning: "朝", day: "日中", evening: "夕方", night: "夜" };

/** 入口（何をもとに探すか）の表示名と絵文字 */
export const ENTRY_MODE_LABEL = { voice: "鳴き声から", sight: "姿から", both: "両方" } as const;
export const ENTRY_MODE_EMOJI = { voice: "🎵", sight: "👀", both: "🎵👀" } as const;

/** 条件を入力するカードの順序 */
export const STEP_TITLES = ["周辺の環境", "どこで見たか", "行動", "鳴き声", "大きさ", "羽の色", "時間帯"];
