import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSightings, postSighting } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const body = { speciesId: "sparrow", date: "2026-11-15", lat: 35.6, lon: 139.5 };
const res = (status: number, json: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => json }) as Response;

describe("postSighting", () => {
  it("種・日付・位置だけをJSONで送る。201で成功", async () => {
    const f = vi.fn().mockResolvedValue(res(201));
    vi.stubGlobal("fetch", f);
    await postSighting(body);
    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0];
    expect(url).toMatch(/\/sightings$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(body);
  });
  it("上限超過などは、サーバーの文言を返す。文言が無ければ既定の文言", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(429, { message: "1日の投稿上限に達しました" })).mockResolvedValueOnce({ ok: false, status: 500, json: async () => Promise.reject(new Error("x")) }));
    await expect(postSighting(body)).rejects.toThrow("1日の投稿上限に達しました");
    await expect(postSighting(body)).rejects.toThrow("共有できませんでした");
  });
  it("通信エラー・オフラインは、理由を返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
    await expect(postSighting(body)).rejects.toThrow("通信を確認してください");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(postSighting(body)).rejects.toThrow("オフラインのため");
  });
});

describe("fetchSightings", () => {
  it("区画を指定して取得し、itemsを返す", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { items: [{ speciesId: "sparrow", date: "2026-11-15", lat: 35.6, lon: 139.5 }] }));
    vi.stubGlobal("fetch", f);
    const items = await fetchSightings(["713:2790", "713:2791"]);
    expect(items).toHaveLength(1);
    expect(f.mock.calls[0][0]).toContain("tiles=713%3A2790%2C713%3A2791");
  });
  it("itemsが無い応答は空。失敗は理由を返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(200, {})).mockResolvedValueOnce(res(500)).mockRejectedValueOnce(new Error("net")));
    expect(await fetchSightings(["1:1"])).toEqual([]);
    await expect(fetchSightings(["1:1"])).rejects.toThrow("取得できませんでした");
    await expect(fetchSightings(["1:1"])).rejects.toThrow("通信を確認してください");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(fetchSightings(["1:1"])).rejects.toThrow("オフラインのため");
  });
});
