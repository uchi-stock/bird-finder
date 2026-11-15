import type { TimeSlot } from "./types";

/** 時刻（0〜23）から時間帯を決める。朝5〜9時、日中9〜16時、夕方16〜19時、それ以外は夜 */
export function timeSlotFromHour(hour: number): TimeSlot {
  if (hour >= 5 && hour < 9) return "morning";
  if (hour >= 9 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
}
