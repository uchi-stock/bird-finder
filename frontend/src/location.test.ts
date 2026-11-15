import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectHabitats } from "./location";

function setGeolocation(impl: ((ok: (p: unknown) => void, ng: (e: { code: number }) => void) => void) | null) {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: impl ? { getCurrentPosition: impl } : undefined });
  if (!impl) delete (navigator as unknown as Record<string, unknown>).geolocation;
}
const at = (lat: number, lon: number) => (ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lon } });
const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
const ng = () => Promise.resolve({ ok: false, status: 504, json: () => Promise.resolve({}) } as Response);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("detectHabitats", () => {
  it("位置情報に未対応なら説明つきで失敗する", async () => {
    setGeolocation(null);
    await expect(detectHabitats()).rejects.toThrow("使えません");
  });
  it("許可されなかった場合は許可を促す", async () => {
    setGeolocation((_ok, fail) => fail({ code: 1 }));
    await expect(detectHabitats()).rejects.toThrow("許可されていません");
  });
  it("その他の取得失敗", async () => {
    setGeolocation((_ok, fail) => fail({ code: 2 }));
    await expect(detectHabitats()).rejects.toThrow("取得できませんでした");
  });
  it("Overpassの結果から環境を判定する", async () => {
    setGeolocation(at(35.64, 139.55));
    vi.stubGlobal("fetch", vi.fn(() => ok({ elements: [{ tags: { waterway: "river" } }] })));
    expect(await detectHabitats()).toEqual(["waterside"]);
  });
  it("一部の接続先が失敗しても、成功した結果を使う", async () => {
    setGeolocation(at(35.64, 139.55));
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(() => (n++ === 0 ? ng() : ok({ elements: [{ tags: { leisure: "park" } }] }))));
    expect(await detectHabitats()).toEqual(["woodland"]);
  });
  it("Overpassが全滅してもNominatimで代替判定する", async () => {
    setGeolocation(at(35.64, 139.55));
    vi.stubGlobal("fetch", vi.fn((url: string) => (url.includes("nominatim") ? ok({ category: "waterway", type: "river" }) : ng())));
    expect(await detectHabitats()).toEqual(["waterside"]);
  });
  it("全て失敗したら対処が分かる文言で失敗する", async () => {
    setGeolocation(at(35.64, 139.55));
    vi.stubGlobal("fetch", vi.fn(() => ng()));
    await expect(detectHabitats()).rejects.toThrow("混み合っている");
  });
  it("同じ場所の結果はキャッシュを使い、再通信しない", async () => {
    setGeolocation(at(35.64, 139.55));
    const f = vi.fn(() => ok({ elements: [{ tags: { natural: "wood" } }] }));
    vi.stubGlobal("fetch", f);
    await detectHabitats();
    const calls = f.mock.calls.length;
    expect(await detectHabitats()).toEqual(["woodland"]);
    expect(f.mock.calls.length).toBe(calls);
  });
  it("localStorageが壊れていても判定できる", async () => {
    setGeolocation(at(35.64, 139.55));
    localStorage.setItem("bird-finder:habitat-cache:v1", "{broken");
    vi.stubGlobal("fetch", vi.fn(() => ok({ elements: [{ tags: { waterway: "stream" } }] })));
    expect(await detectHabitats()).toEqual(["waterside"]);
  });
});
