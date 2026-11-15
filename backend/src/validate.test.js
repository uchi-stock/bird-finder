import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateSighting } from "./validate";

const NOW = new Date("2026-11-15T10:00:00Z");
const ok = { speciesId: "sparrow", date: "2026-11-15", lat: 35.65061, lon: 139.54071 };

describe("validateSighting（投稿の検証）", () => {
  it("正しい投稿は受け付け、位置を約11m（小数4桁）に丸める", () => {
    expect(validateSighting(ok, NOW)).toEqual({ ok: true, value: { speciesId: "sparrow", date: "2026-11-15", lat: 35.6506, lon: 139.5407 } });
  });
  it("オブジェクトでないものは拒否", () => {
    for (const bad of [null, "x", 1, [], undefined]) expect(validateSighting(bad, NOW).ok).toBe(false);
  });
  it("余分な項目（名前・端末ID・時刻など）は拒否し、保存しない", () => {
    for (const extra of ["name", "deviceId", "time", "ip"]) {
      const r = validateSighting({ ...ok, [extra]: "x" }, NOW);
      expect(r.ok).toBe(false);
    }
  });
  it("必要な項目が欠けていれば拒否", () => {
    for (const k of ["speciesId", "date", "lat", "lon"]) {
      const { [k]: _omit, ...rest } = ok;
      expect(validateSighting(rest, NOW).ok).toBe(false);
    }
  });
  it("収録されていない種は拒否", () => {
    expect(validateSighting({ ...ok, speciesId: "dragon" }, NOW).ok).toBe(false);
    expect(validateSighting({ ...ok, speciesId: 5 }, NOW).ok).toBe(false);
  });
  it("日付は YYYY-MM-DD の実在する日だけ", () => {
    for (const d of ["2026/11/15", "2026-13-01", "2026-02-30", "x", 20261115]) expect(validateSighting({ ...ok, date: d }, NOW).ok, String(d)).toBe(false);
  });
  it("日付は直近7日〜明日まで（古すぎる・先すぎるものは拒否）", () => {
    expect(validateSighting({ ...ok, date: "2026-11-08" }, NOW).ok).toBe(true);
    expect(validateSighting({ ...ok, date: "2026-11-07" }, NOW).ok).toBe(false);
    expect(validateSighting({ ...ok, date: "2026-11-16" }, NOW).ok).toBe(true);
    expect(validateSighting({ ...ok, date: "2026-11-17" }, NOW).ok).toBe(false);
  });
  it("位置は数値で、日本国内だけ", () => {
    expect(validateSighting({ ...ok, lat: "35.6" }, NOW).ok).toBe(false);
    expect(validateSighting({ ...ok, lat: 51.5, lon: -0.12 }, NOW).ok).toBe(false);
    expect(validateSighting({ ...ok, lat: NaN }, NOW).ok).toBe(false);
  });
  it("現在時刻を省略しても動作する", () => {
    expect(validateSighting({ ...ok, date: "1999-01-01" }).ok).toBe(false);
  });
});

describe("受け付ける種の一覧", () => {
  it("フロントエンドの種データと一致している（種を足したらこちらも更新する）", () => {
    const front = JSON.parse(readFileSync(new URL("../../frontend/src/data/species.json", import.meta.url), "utf-8")).map((s) => s.species_id);
    const back = JSON.parse(readFileSync(new URL("./species.json", import.meta.url), "utf-8"));
    expect([...back].sort()).toEqual([...front].sort());
  });
});
