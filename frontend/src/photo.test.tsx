import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPhoto, usePhoto } from "./photo";

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.unstubAllGlobals());

describe("fetchPhoto", () => {
  it("サムネイルと出典ページを返す", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ type: "standard", thumbnail: { source: "https://x/330px-a.jpg" }, content_urls: { mobile: { page: "https://m/x" }, desktop: { page: "https://d/x" } } })));
    expect(await fetchPhoto("成功A")).toEqual({ thumbnail: "https://x/330px-a.jpg", pageUrl: "https://m/x" });
  });
  it("モバイルのURLが無ければデスクトップのURLを使う", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ thumbnail: { source: "https://x/a.jpg" }, content_urls: { desktop: { page: "https://d/x" } } })));
    expect((await fetchPhoto("成功B"))?.pageUrl).toBe("https://d/x");
  });
  it("曖昧さ回避ページはnull", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ type: "disambiguation", thumbnail: { source: "https://x/a.jpg" } })));
    expect(await fetchPhoto("曖昧")).toBeNull();
  });
  it("画像が無ければnull", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ type: "standard" })));
    expect(await fetchPhoto("画像なし")).toBeNull();
  });
  it("HTTPエラーはnull", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({}, false)));
    expect(await fetchPhoto("HTTPエラー")).toBeNull();
  });
  it("通信失敗は例外にせずnull", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await fetchPhoto("通信失敗")).toBeNull();
  });
  it("同じ名前は1回しか取得しない（キャッシュ）", async () => {
    const f = vi.fn(() => json({ thumbnail: { source: "https://x/a.jpg" } }));
    vi.stubGlobal("fetch", f);
    await fetchPhoto("キャッシュ");
    await fetchPhoto("キャッシュ");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("usePhoto", () => {
  it("取得できたら写真を返す", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ thumbnail: { source: "https://x/330px-h.jpg" } })));
    const { result } = renderHook(() => usePhoto("フック成功"));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.thumbnail).toBe("https://x/330px-h.jpg"));
  });
});
