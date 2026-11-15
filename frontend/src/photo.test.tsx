import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commonsFlightUrl, fetchFlightPhoto, fetchPhoto, pickFlightPhoto, useFlightPhoto, usePhoto } from "./photo";

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

const page = (title: string, index: number, thumburl: string | undefined = "https://c/500px-x.jpg", meta: Record<string, { value?: string }> = {}) => ({
  index,
  title,
  imageinfo: [{ thumburl, descriptionurl: `https://c/${title}`, extmetadata: meta }],
});

describe("pickFlightPhoto", () => {
  it("ファイル名に飛翔を示す語を含む、検索順位が最も高い画像を選ぶ", () => {
    const json = { query: { pages: { a: page("File:Sparrow.jpg", 1), b: page("File:2 Sparrows in flight.jpg", 3, "https://c/500px-b.jpg"), c: page("File:Sparrow flying.jpg", 2, "https://c/500px-c.jpg") } } };
    expect(pickFlightPhoto(json)?.thumbnail).toBe("https://c/500px-c.jpg");
  });
  it("撮影者（HTMLを除去）とライセンスを返す", () => {
    const json = { query: { pages: { a: page("File:Kite in flight.jpg", 1, undefined, { Artist: { value: '<a href="x">山田 太郎</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" } }) } } };
    const p = pickFlightPhoto(json)!;
    expect(p.credit).toBe("山田 太郎");
    expect(p.license).toBe("CC BY-SA 4.0");
    expect(p.flight).toBe(true);
  });
  it("撮影者が空なら未設定", () => {
    const json = { query: { pages: { a: page("File:Kite flying.jpg", 1, undefined, { Artist: { value: "<b></b>" } }) } } };
    expect(pickFlightPhoto(json)?.credit).toBeUndefined();
  });
  it("飛翔を示す語が無ければnull（ノイズの画像を使わない）", () => {
    expect(pickFlightPhoto({ query: { pages: { a: page("File:Sparrow.jpg", 1) } } })).toBeNull();
  });
  it("サムネイルが無い・結果が空ならnull", () => {
    expect(pickFlightPhoto({ query: { pages: { a: { index: 1, title: "File:x in flight.jpg", imageinfo: [{}] } } } })).toBeNull();
    expect(pickFlightPhoto({})).toBeNull();
  });
  it("説明ページのURLが無ければCommonsのトップを使う", () => {
    const json = { query: { pages: { a: { index: 1, title: "File:x in flight.jpg", imageinfo: [{ thumburl: "https://c/a.jpg" }] } } } };
    expect(pickFlightPhoto(json)?.pageUrl).toBe("https://commons.wikimedia.org/");
  });
});

describe("fetchFlightPhoto / useFlightPhoto", () => {
  it("学名とin flightで検索するURLを作る", () => {
    const u = new URL(commonsFlightUrl("Passer montanus"));
    expect(u.hostname).toBe("commons.wikimedia.org");
    expect(u.searchParams.get("gsrsearch")).toBe('"Passer montanus" "in flight"');
    expect(u.searchParams.get("iiurlwidth")).toBe("500");
    expect(u.searchParams.get("origin")).toBe("*");
  });
  it("取得できれば飛翔画像を返し、同じ学名は1回しか取得しない", async () => {
    const f = vi.fn(() => json({ query: { pages: { a: page("File:Wagtail in flight.jpg", 1) } } }));
    vi.stubGlobal("fetch", f);
    expect((await fetchFlightPhoto("Motacilla alba"))?.flight).toBe(true);
    await fetchFlightPhoto("Motacilla alba");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("HTTPエラー・通信失敗はnull", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({}, false)));
    expect(await fetchFlightPhoto("Err http")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await fetchFlightPhoto("Err net")).toBeNull();
  });
  it("無効なときは取得しない。有効にすると取得し、無効に戻すと消える", async () => {
    const f = vi.fn(() => json({ query: { pages: { a: page("File:Heron flying.jpg", 1, "https://c/500px-h.jpg") } } }));
    vi.stubGlobal("fetch", f);
    const { result, rerender } = renderHook(({ on }) => useFlightPhoto("Ardea cinerea", on), { initialProps: { on: false } });
    expect(result.current).toBeNull();
    expect(f).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(result.current?.thumbnail).toBe("https://c/500px-h.jpg"));
    rerender({ on: false });
    await waitFor(() => expect(result.current).toBeNull());
  });
});
