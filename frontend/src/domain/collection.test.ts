import { describe, expect, it } from "vitest";
import { caughtCount, recordCatch } from "./collection";

const t = new Date("2026-11-15T09:00:00Z");

describe("recordCatch", () => {
  it("初めて捕まえるとNEWで1回目", () => {
    const r = recordCatch({}, "sparrow", t);
    expect(r.isNew).toBe(true);
    expect(r.count).toBe(1);
    expect(r.collection.sparrow.firstAt).toBe(t.toISOString());
  });
  it("2回目はNEWではなく回数が増え、初回日は変わらない", () => {
    const first = recordCatch({}, "sparrow", t);
    const r = recordCatch(first.collection, "sparrow", new Date("2026-11-16T00:00:00Z"));
    expect(r.isNew).toBe(false);
    expect(r.count).toBe(2);
    expect(r.collection.sparrow.firstAt).toBe(t.toISOString());
  });
  it("元のコレクションを破壊しない", () => {
    const base = {};
    recordCatch(base, "sparrow", t);
    expect(base).toEqual({});
  });
  it("種類数を数える", () => {
    const a = recordCatch({}, "a", t).collection;
    const b = recordCatch(a, "b", t).collection;
    expect(caughtCount(recordCatch(b, "a", t).collection)).toBe(2);
  });
});
