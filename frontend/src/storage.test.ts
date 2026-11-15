import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearHome, getPrivacySecret, loadCollection, loadHome, saveCollection, saveHome } from "./storage";

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

describe("プライバシーの保存（秘密の値・自宅）", () => {
  it("秘密の値は初回に作られ、以降は同じ値を返す（32桁の16進）", () => {
    const a = getPrivacySecret();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(getPrivacySecret()).toBe(a);
  });
  it("localStorageが使えなくても、起動中は同じ値を返す", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = getPrivacySecret();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(getPrivacySecret()).toBe(a);
  });
  it("自宅は保存・読み出し・削除できる", () => {
    expect(loadHome()).toBeNull();
    expect(saveHome({ lat: 35.6, lon: 139.5 })).toBe(true);
    expect(loadHome()).toEqual({ lat: 35.6, lon: 139.5 });
    clearHome();
    expect(loadHome()).toBeNull();
  });
  it("壊れた自宅データは未登録として扱う", () => {
    localStorage.setItem("bird-finder:home:v1", "{broken");
    expect(loadHome()).toBeNull();
    localStorage.setItem("bird-finder:home:v1", JSON.stringify({ lat: "x" }));
    expect(loadHome()).toBeNull();
  });
  it("保存・削除できない環境でも例外にならない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(saveHome({ lat: 1, lon: 2 })).toBe(false);
    expect(() => clearHome()).not.toThrow();
  });
});
