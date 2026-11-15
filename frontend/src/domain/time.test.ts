import { describe, expect, it } from "vitest";
import { timeSlotFromHour } from "./time";

describe("timeSlotFromHour", () => {
  it("境界の時刻を正しく分類する", () => {
    expect([4, 5, 8, 9, 15, 16, 18, 19, 23, 0].map(timeSlotFromHour)).toEqual([
      "night", "morning", "morning", "day", "day", "evening", "evening", "night", "night", "night",
    ]);
  });
});
