import { afterEach, describe, expect, it, vi } from "vitest";

// 選び直した写真（photos.json）がある鳥は、Wikipediaへ問い合わせず、その写真を使う
vi.mock("./data/photos.json", () => ({
  default: { テスト鳥: { thumbnail: "https://u/500px-curated.jpg", pageUrl: "https://c/File:Curated.jpg", credit: "撮影者X", license: "CC BY 4.0" } },
}));

afterEach(() => vi.unstubAllGlobals());

describe("fetchPhoto（選び直した写真）", () => {
  it("選び直した写真があれば、通信せずにそれを返す（撮影者・ライセンスつき、curated）", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { fetchPhoto } = await import("./photo");
    const p = await fetchPhoto("テスト鳥");
    expect(p).toEqual({ thumbnail: "https://u/500px-curated.jpg", pageUrl: "https://c/File:Curated.jpg", credit: "撮影者X", license: "CC BY 4.0", curated: true });
    expect(f).not.toHaveBeenCalled();
  });
  it("選び直した写真が無い鳥は、今までどおりWikipediaの代表画像を使う", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ type: "standard", thumbnail: { source: "https://u/330px-a.jpg" }, content_urls: { mobile: { page: "https://w/a" } } }) });
    vi.stubGlobal("fetch", f);
    const { fetchPhoto } = await import("./photo");
    const p = await fetchPhoto("別の鳥");
    expect(p?.thumbnail).toBe("https://u/330px-a.jpg");
    expect(p?.curated).toBeUndefined();
    expect(f).toHaveBeenCalledOnce();
  });
});
