import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commonsAudioUrl, fetchCallAudio, pickAudio, playAudio, resetAudioForTest, stopAudio, unlockAudio, type CommonsResponse } from "./callAudio";

const page = (title: string, index: number, info: Record<string, unknown> = {}) => ({
  index,
  title,
  videoinfo: [{ url: "https://u/orig.ogg", mime: "application/ogg", descriptionurl: `https://c/${title}`, derivatives: [{ type: 'audio/mpeg', src: "https://u/t/orig.ogg.mp3" }], extmetadata: {}, ...info }],
});
const resp = (...pages: ReturnType<typeof page>[]): CommonsResponse => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) } });
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

describe("pickAudio: 単独の鳴き声らしい録音を選ぶ（#139）", () => {
  const mp3 = (n: string) => [{ type: "audio/mpeg", src: `https://u/${n}.mp3` }];
  it("ファイル名・説明に合唱・環境音の手がかりがある録音は、後回しにする", () => {
    const r = resp(
      page("File:Anas platyrhynchos dawn chorus.ogg", 1, { derivatives: mp3("chorus") }),
      page("File:Anas platyrhynchos - Mallard.ogg", 2, { derivatives: mp3("solo") }),
    );
    expect(pickAudio(r, "Anas platyrhynchos", true)?.src).toBe("https://u/solo.mp3");
    const desc = resp(
      page("File:Anas platyrhynchos 1.ogg", 1, { derivatives: mp3("amb"), extmetadata: { ImageDescription: { value: "<p>Ambient sound of a lake</p>" } } }),
      page("File:Anas platyrhynchos 2.ogg", 2, { derivatives: mp3("solo2") }),
    );
    expect(pickAudio(desc, "Anas platyrhynchos", true)?.src).toBe("https://u/solo2.mp3");
  });
  it("音楽作品のカテゴリに入っているファイルは、後回しにする（例: マガモの学名カテゴリにある、ヤナーチェクのオペラ）", () => {
    const opera = { ...page("File:Janacek - kacena divoka.ogg", 1, { derivatives: mp3("opera") }), categories: [{ title: "Category:Anas platyrhynchos" }, { title: "Category:Operas by Leoš Janáček" }] };
    const solo = { ...page("File:Anas platyrhynchos XC123.ogg", 2, { derivatives: mp3("solo") }), categories: [{ title: "Category:Anas platyrhynchos" }] };
    expect(pickAudio(resp(opera, solo), "Anas platyrhynchos", false)?.src).toBe("https://u/solo.mp3"); // 非厳密（カテゴリ検索）でも
  });
  it("長い録音（3分超）は後回しにする", () => {
    const r = resp(page("File:Anas platyrhynchos long.ogg", 1, { duration: 600, derivatives: mp3("long") }), page("File:Anas platyrhynchos short.ogg", 2, { duration: 20, derivatives: mp3("short") }));
    expect(pickAudio(r, "Anas platyrhynchos", true)?.src).toBe("https://u/short.mp3");
  });
  it("単独らしい録音がほかに無ければ、後回しにした録音を使う（音源なしにしない）", () => {
    const r = resp(page("File:Anas platyrhynchos chorus.ogg", 1, { derivatives: mp3("only") }));
    expect(pickAudio(r, "Anas platyrhynchos", true)?.src).toBe("https://u/only.mp3");
  });
  it("同じ区分の中では、検索の順位のまま選ぶ", () => {
    const r = resp(page("File:Anas platyrhynchos b.ogg", 2, { derivatives: mp3("b") }), page("File:Anas platyrhynchos a.ogg", 1, { derivatives: mp3("a") }));
    expect(pickAudio(r, "Anas platyrhynchos", true)?.src).toBe("https://u/a.mp3");
  });
});

describe("pickAudio: 人の発音・音楽の録音を避ける（#139。調査で、全種に多数あると分かった）", () => {
  const mp3 = (n: string) => [{ type: "audio/mpeg", src: `https://u/${n}.mp3` }];
  it("人が鳥の名前を発音した録音（説明・カテゴリ）は、後回しにする。例: ドイツ語でSilberreiherを読み上げたファイル", () => {
    const say = { ...page("File:De-Silberreiher.ogg", 1, { derivatives: mp3("say"), extmetadata: { ImageDescription: { value: "pronunciation recording" } } }), categories: [{ title: "Category:Ardea alba" }] };
    const call = page("File:Ardea alba XC1.ogg", 2, { derivatives: mp3("call") });
    expect(pickAudio(resp(say, call), "Ardea alba", false)?.src).toBe("https://u/call.mp3");
    const cat = { ...page("File:Jer-gliaineux.ogg", 1, { derivatives: mp3("jer") }), categories: [{ title: "Category:Jèrriais pronunciation" }] };
    expect(pickAudio(resp(cat, call), "Ardea alba", false)?.src).toBe("https://u/call.mp3");
  });
  it("allowSuspicious=falseでは、疑わしい録音を採用しない（ほかの検索を先に試すため）", () => {
    const opera = { ...page("File:Janacek - kacena divoka.ogg", 1, { derivatives: mp3("opera") }), categories: [{ title: "Category:Audio files of choral music" }] };
    expect(pickAudio(resp(opera), "Anas platyrhynchos", false, false)).toBeNull();
    expect(pickAudio(resp(opera), "Anas platyrhynchos", false, true)?.src).toBe("https://u/opera.mp3");
  });
});

describe("pickAudio", () => {
  it("OggにはCommonsのMP3版（iPhoneで再生できる）を使う", () => {
    expect(pickAudio(resp(page("File:Hypsipetes amaurotis 1.ogg", 1)), "Hypsipetes amaurotis", true)?.src).toBe("https://u/t/orig.ogg.mp3");
  });
  it("元ファイルがMP3ならそのまま使う", () => {
    const p = page("File:Passer montanus XC1.mp3", 1, { mime: "audio/mpeg", url: "https://u/a.mp3", derivatives: [{ type: 'audio/ogg; codecs="vorbis"', src: "https://u/a.ogg" }] });
    expect(pickAudio(resp(p), "Passer montanus", true)?.src).toBe("https://u/a.mp3");
  });
  it("MP3が無く、元もMP3でなければ採用しない（再生できない可能性があるため）", () => {
    const p = page("File:Passer montanus.wav", 1, { mime: "audio/wav", derivatives: [{ type: 'audio/ogg; codecs="vorbis"', src: "https://u/a.ogg" }] });
    expect(pickAudio(resp(p), "Passer montanus", true)).toBeNull();
  });
  it("録音者（HTMLを除去）・ライセンス・出典ページ・ファイル名を返す", () => {
    const p = page("File:Passer montanus XC2.ogg", 1, { extmetadata: { Artist: { value: '<a href="x">山田 太郎</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" } } });
    const a = pickAudio(resp(p), "Passer montanus", true)!;
    expect(a.credit).toBe("山田 太郎");
    expect(a.license).toBe("CC BY-SA 4.0");
    expect(a.pageUrl).toBe("https://c/File:Passer montanus XC2.ogg");
    expect(a.title).toBe("Passer montanus XC2.ogg");
  });
  it("録音者が空なら未設定", () => {
    expect(pickAudio(resp(page("File:Passer montanus.ogg", 1, { extmetadata: { Artist: { value: "<b></b>" } } })), "Passer montanus", true)?.credit).toBeUndefined();
  });
  it("厳密モードでは、ファイル名に学名を含まない音源（別の鳥の可能性）を使わない", () => {
    const r = resp(page("File:Monticola solitarius 2025.ogg", 1), page("File:Passer-montanus-2025.ogg", 2, { derivatives: [{ type: "audio/mpeg", src: "https://u/p.mp3" }] }));
    expect(pickAudio(r, "Hypsipetes amaurotis", true)).toBeNull();
    expect(pickAudio(r, "Passer montanus", true)?.src).toBe("https://u/p.mp3"); // ハイフン区切りも照合する
  });
  it("カテゴリ検索（非厳密）では、ファイル名に学名が無くても採用する（例: ウグイスの録音）", () => {
    expect(pickAudio(resp(page("File:Uguisu5740 cu.ogg", 1)), "Horornis diphone", false)).not.toBeNull();
  });
  it("検索順位の高い順に選び、説明ページURLが無ければCommonsのトップを使う", () => {
    const r = resp(page("File:Passer montanus b.ogg", 2), page("File:Passer montanus a.ogg", 1, { descriptionurl: undefined }));
    expect(pickAudio(r, "Passer montanus", true)?.title).toBe("Passer montanus a.ogg");
    expect(pickAudio(r, "Passer montanus", true)?.pageUrl).toBe("https://commons.wikimedia.org/");
  });
  it("結果が空・videoinfoが無ければnull", () => {
    expect(pickAudio({}, "Passer montanus", false)).toBeNull();
    expect(pickAudio({ query: { pages: { a: { index: 1, title: "File:x.ogg" } } } }, "Passer montanus", false)).toBeNull();
  });
});

describe("commonsAudioUrl", () => {
  it("カテゴリ検索と全文検索のURLを作る", () => {
    const c = new URL(commonsAudioUrl("Passer montanus", "category"));
    expect(c.searchParams.get("gsrsearch")).toBe('filetype:audio incategory:"Passer montanus"');
    expect(c.searchParams.get("viprop")).toContain("derivatives");
    expect(c.searchParams.get("origin")).toBe("*");
    expect(new URL(commonsAudioUrl("Passer montanus", "text")).searchParams.get("gsrsearch")).toBe('filetype:audio "Passer montanus"');
  });
});

describe("fetchCallAudio", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("カテゴリで見つかれば、全文検索はしない", async () => {
    const f = vi.fn(() => json(resp(page("File:Uguisu.ogg", 1))));
    vi.stubGlobal("fetch", f);
    expect((await fetchCallAudio("Horornis diphone"))?.src).toBe("https://u/t/orig.ogg.mp3");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("カテゴリに無ければ、全文検索（学名を含むファイル名に限る）で探す", async () => {
    const f = vi.fn().mockImplementationOnce(() => json({})).mockImplementationOnce(() => json(resp(page("File:Motacilla alba x.ogg", 1))));
    vi.stubGlobal("fetch", f);
    expect((await fetchCallAudio("Motacilla alba"))?.title).toBe("Motacilla alba x.ogg");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("カテゴリが音楽作品だけなら、全文検索の単独の鳴き声を使う（マガモ: オペラ「野鴨」を避ける）（#139）", async () => {
    const opera = { ...page("File:Janacek - kacena divoka.ogg", 1, { derivatives: [{ type: "audio/mpeg", src: "https://u/opera.mp3" }] }), categories: [{ title: "Category:Audio files of music by Leoš Janáček" }] };
    const mallard = page("File:Anas platyrhynchos - Mallard - XC112828.ogg", 1, { derivatives: [{ type: "audio/mpeg", src: "https://u/mallard.mp3" }] });
    const f = vi.fn().mockImplementationOnce(() => json(resp(opera))).mockImplementationOnce(() => json(resp(mallard)));
    vi.stubGlobal("fetch", f);
    expect((await fetchCallAudio("Anas platyrhynchos mallard-test"))?.src).toBe("https://u/mallard.mp3");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("単独の鳴き声がどこにも無ければ、疑わしい録音を使う（音源なしにしない）", async () => {
    const opera = { ...page("File:Only music.ogg", 1, { derivatives: [{ type: "audio/mpeg", src: "https://u/only.mp3" }] }), categories: [{ title: "Category:Opera" }] };
    vi.stubGlobal("fetch", vi.fn(() => json(resp(opera))));
    expect((await fetchCallAudio("Only music-test"))?.src).toBe("https://u/only.mp3");
  });
  it("どちらでも見つからなければnull", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({})));
    expect(await fetchCallAudio("Nothing here")).toBeNull();
  });
  it("HTTPエラー・通信失敗はnull", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({}, false)));
    expect(await fetchCallAudio("Err http")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await fetchCallAudio("Err net")).toBeNull();
  });
  it("同じ学名は1回しか取得しない（キャッシュ）", async () => {
    const f = vi.fn(() => json(resp(page("File:Corvus corone.ogg", 1))));
    vi.stubGlobal("fetch", f);
    await fetchCallAudio("Corvus corone");
    await fetchCallAudio("Corvus corone");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("共有<audio>（iOS Safari対策）", () => {
  const instances: FakeAudio[] = [];
  class FakeAudio {
    src = "";
    onended: (() => void) | null = null;
    paused = true;
    play = vi.fn(() => {
      this.paused = false;
      return Promise.resolve();
    });
    pause = vi.fn(() => {
      this.paused = true;
    });
    constructor() {
      instances.push(this);
    }
  }
  beforeEach(() => {
    instances.length = 0;
    resetAudioForTest();
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("解錠は無音データで再生する。要素は1つを使い回す", async () => {
    unlockAudio();
    expect(instances).toHaveLength(1);
    expect(instances[0].src).toContain("data:audio/wav");
    expect(instances[0].play).toHaveBeenCalled();
    await playAudio("https://u/a.mp3", () => {});
    expect(instances).toHaveLength(1);
    expect(instances[0].src).toBe("https://u/a.mp3");
  });
  it("再生が終わると、渡したコールバックが呼ばれる", async () => {
    const onEnded = vi.fn();
    await playAudio("https://u/a.mp3", onEnded);
    instances[0].onended?.();
    expect(onEnded).toHaveBeenCalled();
  });
  it("停止すると止まり、終了コールバックは外れる", async () => {
    await playAudio("https://u/a.mp3", vi.fn());
    stopAudio();
    expect(instances[0].pause).toHaveBeenCalled();
    expect(instances[0].onended).toBeNull();
  });
  it("再生前に停止しても例外にならない", () => {
    expect(() => stopAudio()).not.toThrow();
  });
  it("解錠の再生が拒否されても例外にならない", () => {
    class Rejecting extends FakeAudio {
      play = vi.fn(() => Promise.reject(new Error("blocked")));
    }
    vi.stubGlobal("Audio", Rejecting);
    resetAudioForTest();
    expect(() => unlockAudio()).not.toThrow();
  });
  it("Audioが使えない環境でも解錠で例外にならない", () => {
    vi.stubGlobal("Audio", () => {
      throw new Error("unsupported");
    });
    resetAudioForTest();
    expect(() => unlockAudio()).not.toThrow();
  });
  it("再生が拒否されたら、呼び出し側に例外として伝える", async () => {
    class Rejecting extends FakeAudio {
      play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    }
    vi.stubGlobal("Audio", Rejecting);
    resetAudioForTest();
    await expect(playAudio("https://u/a.mp3", () => {})).rejects.toThrow("NotAllowedError");
  });
});
