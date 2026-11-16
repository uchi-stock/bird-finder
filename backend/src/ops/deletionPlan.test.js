import { describe, expect, it } from "vitest";
import { buildQuery, parseFilters, planDeletion } from "./deletionPlan";

describe("parseFilters", () => {
  it("区画と日付が必須で、全件削除はできない", () => {
    expect(parseFilters({}).ok).toBe(false);
    expect(parseFilters({ tile: "713:2790" }).ok).toBe(false);
    expect(parseFilters({ date: "2026-11-16" }).ok).toBe(false);
  });
  it("不正な形式を拒否する", () => {
    expect(parseFilters({ tile: "abc", date: "2026-11-16" }).ok).toBe(false);
    expect(parseFilters({ tile: "713:2790", date: "2026/11/16" }).ok).toBe(false);
    expect(parseFilters({ tile: "713:2790", date: "2026-11-16", speciesId: "A; DROP" }).ok).toBe(false);
  });
  it("正しい入力は受け付け、speciesIdは任意（空文字は未指定）", () => {
    expect(parseFilters({ tile: "713:2790", date: "2026-11-16" })).toEqual({ ok: true, value: { tile: "713:2790", date: "2026-11-16", speciesId: undefined } });
    expect(parseFilters({ tile: "713:2790", date: "2026-11-16", speciesId: "" }).value.speciesId).toBeUndefined();
    expect(parseFilters({ tile: "713:2790", date: "2026-11-16", speciesId: "sparrow" }).value.speciesId).toBe("sparrow");
  });
});

describe("buildQuery", () => {
  it("区画の一致と、日付の前方一致で絞る", () => {
    const q = buildQuery("tbl", { tile: "713:2790", date: "2026-11-16" });
    expect(q.TableName).toBe("tbl");
    expect(q.KeyConditionExpression).toContain("begins_with(sk, :d)");
    expect(q.ExpressionAttributeValues).toEqual({ ":t": { S: "713:2790" }, ":d": { S: "2026-11-16#" } });
  });
});

describe("planDeletion", () => {
  const items = [
    { tile: { S: "1:1" }, sk: { S: "2026-11-16#a" }, speciesId: { S: "sparrow" } },
    { tile: { S: "1:1" }, sk: { S: "2026-11-16#b" }, speciesId: { S: "mallard" } },
    { tile: { S: "1:1" }, sk: { S: "2026-11-16#c" }, speciesId: { S: "sparrow" } },
  ];
  it("speciesIdが無ければ、取得した項目すべてが対象。種ごとの件数を出す", () => {
    const p = planDeletion(items, {});
    expect(p.count).toBe(3);
    expect(p.bySpecies).toEqual({ sparrow: 2, mallard: 1 });
    expect(p.keys[0]).toEqual({ tile: { S: "1:1" }, sk: { S: "2026-11-16#a" } });
  });
  it("speciesIdがあれば、その種だけが対象", () => {
    const p = planDeletion(items, { speciesId: "mallard" });
    expect(p.count).toBe(1);
    expect(p.keys).toEqual([{ tile: { S: "1:1" }, sk: { S: "2026-11-16#b" } }]);
  });
  it("対象が無ければ0件", () => {
    expect(planDeletion(items, { speciesId: "crow" }).count).toBe(0);
    expect(planDeletion([{ tile: { S: "1:1" }, sk: { S: "x" } }], {}).bySpecies).toEqual({ "?": 1 });
  });
});
