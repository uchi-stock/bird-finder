import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCollection, saveCollection } from "./storage";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("storage", () => {
  it("保存した図鑑を読み戻せる", () => {
    saveCollection({ sparrow: { firstAt: "2026-01-01T00:00:00.000Z", count: 2 } });
    expect(loadCollection()).toEqual({ sparrow: { firstAt: "2026-01-01T00:00:00.000Z", count: 2 } });
  });
  it("未保存なら空", () => {
    expect(loadCollection()).toEqual({});
  });
  it("壊れたJSONでも例外にせず空を返す", () => {
    localStorage.setItem("bird-finder:collection:v1", "{broken");
    expect(loadCollection()).toEqual({});
  });
  it("オブジェクトでない値は空として扱う", () => {
    localStorage.setItem("bird-finder:collection:v1", "42");
    expect(loadCollection()).toEqual({});
  });
  it("localStorageが使えなくても読み書きで例外にならない", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadCollection()).toEqual({});
    expect(() => saveCollection({})).not.toThrow();
  });
});
