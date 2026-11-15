import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const detectHabitats = vi.fn();
const usePhoto = vi.fn();
const fetchCallAudio = vi.fn();
const playAudio = vi.fn();
const stopAudio = vi.fn();
const unlockAudio = vi.fn();
const useFlightPhoto = vi.fn();
vi.mock("./callAudio", () => ({
  fetchCallAudio: (s: string) => fetchCallAudio(s),
  playAudio: (src: string, end: () => void) => playAudio(src, end),
  stopAudio: () => stopAudio(),
  unlockAudio: () => unlockAudio(),
}));
vi.mock("./location", () => ({ detectHabitats: () => detectHabitats() }));
vi.mock("./photo", () => ({ usePhoto: (n: string) => usePhoto(n), useFlightPhoto: (s: string, e: boolean) => useFlightPhoto(s, e) }));

const section = (title: string) => screen.getByRole("heading", { name: new RegExp(title) }).closest("section") as HTMLElement;
const uguisuCard = () => screen.getByText("ウグイス").closest("li") as HTMLElement;
// 絵文字（aria-hidden）を除いたボタンの文字
const labelOf = (b: HTMLElement) =>
  Array.from(b.childNodes)
    .filter((n) => !(n instanceof HTMLElement && n.getAttribute("aria-hidden") === "true"))
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();
const chips = (title: string) => within(section(title)).getAllByRole("button").map(labelOf);
const chip = (title: string, label: string) => within(section(title)).getByRole("button", { name: new RegExp(label) });

beforeEach(() => {
  // 時間帯の初期値（現在時刻）を固定する: 朝7時
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 7, 0, 0));
  localStorage.clear();
  detectHabitats.mockReset().mockResolvedValue([]);
  usePhoto.mockReset().mockReturnValue(null);
  useFlightPhoto.mockReset().mockReturnValue(null);
  fetchCallAudio.mockReset().mockResolvedValue({ src: "https://u/a.mp3", pageUrl: "https://c/File:a", title: "a.ogg", credit: "録音者A", license: "CC BY 4.0" });
  playAudio.mockReset().mockResolvedValue(undefined);
  stopAudio.mockReset();
  unlockAudio.mockReset();
});

afterEach(() => vi.useRealTimers());

async function renderApp() {
  const view = render(<App />);
  await waitFor(() => expect(detectHabitats).toHaveBeenCalled());
  await act(async () => {});
  return view;
}

describe("App: 基本表示", () => {
  it("タイトル・バージョン・更新日時を表示する", async () => {
    await renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("声しか知らない鳥を探す");
    expect(screen.getByText(/v0\.0\.0-test/)).toBeInTheDocument();
  });
  it("開いた直後は、現在の時間帯（朝）に合う鳥を最大3件出す", async () => {
    await renderApp();
    expect(within(screen.getByRole("list")).getAllByRole("listitem").length).toBeLessThanOrEqual(3);
    expect(chip("時間帯", "朝")).toHaveClass("on");
  });
  it("入力を全て外すと案内を出し、候補は出さない", async () => {
    await renderApp();
    await userEvent.click(chip("時間帯", "朝"));
    expect(screen.getByText(/1つ以上入力すると/)).toBeInTheDocument();
  });
  it("入力の順序は 環境 → 場所 → 行動", async () => {
    await renderApp();
    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(order.indexOf("周辺の環境（複数可）")).toBeLessThan(order.indexOf("どこで見たか"));
    expect(order.indexOf("どこで見たか")).toBeLessThan(order.indexOf("行動（複数可）"));
  });
});

describe("App: 候補の表示", () => {
  it("大きさを選ぶと最大3件の候補と、一致・未入力の理由を表示する", async () => {
    await renderApp();
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "2" }));
    const items = within(screen.getByRole("list")).queryAllByRole("listitem");
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/一致:/).length).toBeGreaterThan(0);
    expect(screen.getByText(/確率ではありません/)).toBeInTheDocument();
  });
  it("鳴き声が一致する鳥が無ければ、無理に出さず案内する", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ゾゾゾゾ");
    expect(screen.getByText(/近い鳥が見つかりませんでした/)).toBeInTheDocument();
  });
  it("オノマトペで鳥が出る（ホーホケキョ → ウグイス）", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    expect(screen.getByText("ウグイス")).toBeInTheDocument();
  });
  it("入力をクリアすると候補が消える", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    await userEvent.click(screen.getByRole("button", { name: "入力をクリア" }));
    expect(screen.queryByText("ウグイス")).toBeNull();
  });
});

describe("App: 前の回答で後続の選択肢を絞る", () => {
  it("住宅街を選ぶと、場所に水辺・草むらが出ない", async () => {
    await renderApp();
    await userEvent.click(chip("周辺の環境", "住宅街"));
    const places = chips("どこで見たか").join(",");
    expect(places).not.toMatch(/水辺・水面/);
    expect(places).not.toMatch(/草むら/);
    expect(places).toMatch(/建物や屋根/);
  });
  it("空を選ぶと飛ぶが自動で選ばれ、選択肢は飛ぶ・鳴くのみ", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    expect(chips("行動")).toEqual(["飛ぶ・滑空する", "鳴く・歌う"]);
    expect(chip("行動", "飛ぶ")).toHaveClass("on");
  });
  it("空から地面へ変えると、自動で入った飛ぶが外れる", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    await userEvent.click(chip("どこで見たか", "地面の上"));
    expect(chip("行動", "飛ぶ")).not.toHaveClass("on");
  });
  it("環境を変えて選べなくなった場所は自動で解除される", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "水辺・水面"));
    await userEvent.click(chip("周辺の環境", "住宅街"));
    await waitFor(() => expect(chip("どこで見たか", "地面の上")).not.toHaveClass("on"));
    expect(chips("どこで見たか").join(",")).not.toMatch(/水辺・水面/);
  });
  it("時間帯は現在時刻から自動で選ばれ、もう一度押すと解除できる", async () => {
    await renderApp();
    const on = within(section("時間帯")).getAllByRole("button").filter((b) => b.classList.contains("on"));
    expect(on).toHaveLength(1);
    await userEvent.click(on[0]);
    expect(within(section("時間帯")).queryAllByRole("button").filter((b) => b.classList.contains("on"))).toHaveLength(0);
  });
});

describe("App: 鳴き声が聞こえなかった", () => {
  it("選ぶとオノマトペ欄が無効になり、入力済みの文字は消える。聞こえない種が出る", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "チチチ");
    await userEvent.click(screen.getByRole("button", { name: "鳴き声は聞こえなかった" }));
    const input = screen.getByPlaceholderText(/ホーホケキョ/);
    expect(input).toBeDisabled();
    expect(input).toHaveValue("");
    expect(screen.getAllByText(/鳴き声（聞こえない）/).length).toBeGreaterThan(0);
  });
  it("もう一度押すと解除できる", async () => {
    await renderApp();
    const btn = screen.getByRole("button", { name: "鳴き声は聞こえなかった" });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.getByPlaceholderText(/ホーホケキョ/)).toBeEnabled();
  });
  it("夕方に空を飛ぶ小さな影で、鳴き声が聞こえなければコウモリが出る", async () => {
    vi.setSystemTime(new Date(2026, 5, 15, 18, 0, 0));
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "1" }));
    await userEvent.click(screen.getByRole("button", { name: "鳴き声は聞こえなかった" }));
    expect(screen.getByText("アブラコウモリ")).toBeInTheDocument();
    expect(screen.getByText(/鳥ではなくコウモリ/)).toBeInTheDocument();
  });
});

describe("App: 行動の選択肢と絵文字", () => {
  it("行動は7つ: 泳ぐ／水の中に立つ・歩く／止まる・立つ・歩く／飛ぶ／鳴く／採食／羽繕い", async () => {
    await renderApp();
    expect(chips("行動")).toEqual(["泳ぐ", "水の中に立つ・歩く", "止まる・立つ・歩く", "飛ぶ・滑空する", "鳴く・歌う", "採食する・つつく", "羽繕いする"]);
  });
  it("地面の上では、泳ぐ・水の中に立つ・歩くを出さない", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "地面の上"));
    const behaviors = chips("行動");
    expect(behaviors).not.toContain("泳ぐ");
    expect(behaviors).not.toContain("水の中に立つ・歩く");
    expect(behaviors).toContain("止まる・立つ・歩く");
  });
  it("水辺・水面では、泳ぐと水の中に立つ・歩くを選べる", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "水辺・水面"));
    expect(chips("行動")).toEqual(expect.arrayContaining(["泳ぐ", "水の中に立つ・歩く"]));
  });
  it("絵文字は読み上げ対象外（aria-hidden）で、各ボタンに付いている", async () => {
    await renderApp();
    for (const title of ["周辺の環境", "どこで見たか", "行動", "鳴き声", "大きさ", "時間帯"]) {
      for (const b of within(section(title)).getAllByRole("button")) {
        expect(b.querySelector('.emoji[aria-hidden="true"]'), `${title}: ${labelOf(b)}`).not.toBeNull();
      }
    }
    expect(screen.getByRole("button", { name: "探す" }).querySelector(".emoji")).not.toBeNull();
    expect(screen.getByRole("button", { name: /図鑑 0\/44/ }).querySelector(".emoji")).not.toBeNull();
    expect(screen.getByRole("button", { name: /現在地から判定する/ }).querySelector(".emoji")).not.toBeNull();
  });
});

describe("App: 現在地から周辺環境", () => {
  it("起動時に現在地から環境を判定して初期値にする", async () => {
    detectHabitats.mockResolvedValue(["waterside"]);
    await renderApp();
    expect(chip("周辺の環境", "川辺")).toHaveClass("on");
    expect(screen.getByText(/現在地の周辺から判定しました/)).toBeInTheDocument();
  });
  it("判定できなければ手動選択を促す", async () => {
    detectHabitats.mockResolvedValue([]);
    await renderApp();
    expect(screen.getByText(/判定できませんでした/)).toBeInTheDocument();
  });
  it("失敗時は原因を表示し、ボタンで再試行できる", async () => {
    detectHabitats.mockRejectedValueOnce(new Error("位置情報の利用が許可されていません"));
    await renderApp();
    expect(screen.getByText("位置情報の利用が許可されていません")).toBeInTheDocument();
    detectHabitats.mockResolvedValue(["urban"]);
    await userEvent.click(screen.getByRole("button", { name: /現在地から判定する/ }));
    await waitFor(() => expect(chip("周辺の環境", "住宅街")).toHaveClass("on"));
  });
  it("Error以外が投げられても既定の文言を表示する", async () => {
    detectHabitats.mockRejectedValueOnce("x");
    await renderApp();
    expect(screen.getByText("現在地を取得できませんでした")).toBeInTheDocument();
  });
});

describe("App: 写真", () => {
  it("写真が無ければ「写真なし」を表示する", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    expect(screen.getAllByText("写真なし").length).toBeGreaterThan(0);
  });
  it("写真をタップすると拡大し、読み込み失敗時は元の写真に戻る。タップで閉じる", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    await userEvent.click(screen.getAllByRole("button", { name: /写真を拡大/ })[0]);
    const big = document.querySelector(".lightbox img") as HTMLImageElement;
    expect(big.src).toContain("/500px-a.jpg");
    fireEvent.error(big);
    expect((document.querySelector(".lightbox img") as HTMLImageElement).src).toContain("/330px-a.jpg");
    expect(screen.getByRole("link", { name: /出典: Wikipedia/ })).toHaveAttribute("href", "https://w/x");
    await userEvent.click(document.querySelector(".lightbox") as HTMLElement);
    expect(document.querySelector(".lightbox")).toBeNull();
  });
});

const firstCard = () => within(screen.getByRole("list")).getAllByRole("listitem")[0];

describe("App: 鳥をタップで鳴き声を再生", () => {
  it("カードをタップすると、同期的に解錠してから音源を再生し、録音者とライセンスと出典を表示する", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    expect(unlockAudio).toHaveBeenCalledTimes(1); // タップの同期処理内
    await waitFor(() => expect(screen.getByText(/もう一度タップで停止/)).toBeInTheDocument());
    expect(playAudio).toHaveBeenCalledWith("https://u/a.mp3", expect.any(Function));
    expect(screen.getByText(/録音者A ／ CC BY 4.0/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "出典(Commons)" })).toHaveAttribute("href", "https://c/File:a");
    expect(firstCard()).toHaveClass("playing");
  });
  it("探している間は「音源を探しています」を表示する", async () => {
    let resolve!: (v: unknown) => void;
    fetchCallAudio.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderApp();
    fireEvent.click(firstCard());
    expect(await screen.findByText(/音源を探しています/)).toBeInTheDocument();
    await act(async () => resolve(null));
  });
  it("もう一度タップすると停止する", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    await screen.findByText(/もう一度タップで停止/);
    fireEvent.click(firstCard());
    expect(stopAudio).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(/もう一度タップで停止/)).toBeNull());
    expect(screen.getByText(/鳥をタップすると鳴き声を再生します/)).toBeInTheDocument();
  });
  it("音源が見つからなければ理由を表示し、再生しない", async () => {
    fetchCallAudio.mockResolvedValue(null);
    await renderApp();
    fireEvent.click(firstCard());
    expect(await screen.findByText(/音源は見つかりませんでした/)).toBeInTheDocument();
    expect(playAudio).not.toHaveBeenCalled();
  });
  it("再生が拒否されたら、対処を案内する", async () => {
    playAudio.mockRejectedValue(new Error("NotAllowedError"));
    await renderApp();
    fireEvent.click(firstCard());
    expect(await screen.findByText(/再生できませんでした/)).toBeInTheDocument();
  });
  it("再生が終わると表示が元に戻る", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    await screen.findByText(/もう一度タップで停止/);
    const onEnded = playAudio.mock.calls[0][1] as () => void;
    act(() => onEnded());
    expect(screen.queryByText(/もう一度タップで停止/)).toBeNull();
  });
  it("別の鳥をタップすると、そちらに切り替わる（古い取得結果は無視する）", async () => {
    let resolveFirst!: (v: unknown) => void;
    fetchCallAudio.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));
    await renderApp();
    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    await screen.findByText(/もう一度タップで停止/);
    await act(async () => resolveFirst({ src: "https://u/old.mp3", pageUrl: "x", title: "old" }));
    expect(playAudio).toHaveBeenCalledTimes(1);
    expect(playAudio.mock.calls[0][0]).toBe("https://u/a.mp3");
  });
  it("捕まえる・写真の拡大のボタンでは再生しない", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    await renderApp();
    fireEvent.click(within(firstCard()).getByRole("button", { name: /捕まえる/ }));
    fireEvent.click(within(firstCard()).getByRole("button", { name: /写真を拡大/ }));
    expect(unlockAudio).not.toHaveBeenCalled();
    expect(fetchCallAudio).not.toHaveBeenCalled();
  });
});

describe("App: 状況に応じた姿の画像", () => {
  const standing = { thumbnail: "https://u/330px-stand.jpg", pageUrl: "https://w/stand" };
  const flightPhoto = { thumbnail: "https://c/500px-fly.jpg", pageUrl: "https://c/File:Fly.jpg", credit: "撮影者A", license: "CC BY 4.0", flight: true };
  it("止まっている状況では通常の画像を使い、飛翔画像は取得しない", async () => {
    usePhoto.mockReturnValue(standing);
    useFlightPhoto.mockReturnValue(flightPhoto);
    await renderApp();
    await userEvent.click(chip("行動", "止まる"));
    expect(screen.queryByText("飛翔")).toBeNull();
    expect(useFlightPhoto).toHaveBeenLastCalledWith(expect.any(String), false);
    expect(document.querySelector(".results .photo img")).toHaveAttribute("src", standing.thumbnail);
  });
  it("飛んでいる状況（行動:飛ぶ）では飛翔の画像と「飛翔」の印を表示し、出典に撮影者とライセンスを出す", async () => {
    usePhoto.mockReturnValue(standing);
    useFlightPhoto.mockReturnValue(flightPhoto);
    await renderApp();
    await userEvent.click(chip("行動", "飛ぶ"));
    expect(useFlightPhoto).toHaveBeenLastCalledWith(expect.any(String), true);
    expect(screen.getAllByText("飛翔").length).toBeGreaterThan(0);
    expect(document.querySelector(".results .photo img")).toHaveAttribute("src", flightPhoto.thumbnail);
    await userEvent.click(screen.getAllByRole("button", { name: /写真を拡大/ })[0]);
    expect(screen.getByRole("link", { name: /撮影: 撮影者A ／ CC BY 4.0/ })).toHaveAttribute("href", flightPhoto.pageUrl);
  });
  it("場所が空なら、飛翔画像が見つからないときは通常の画像に戻す", async () => {
    usePhoto.mockReturnValue(standing);
    useFlightPhoto.mockReturnValue(null);
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    expect(document.querySelector(".results .photo img")).toHaveAttribute("src", standing.thumbnail);
    expect(screen.queryByText("飛翔")).toBeNull();
  });
  it("飛翔画像の拡大では、出典の撮影者が無ければ「不明」と表示する", async () => {
    useFlightPhoto.mockReturnValue({ thumbnail: "https://c/500px-fly.jpg", pageUrl: "https://c/x", flight: true });
    await renderApp();
    await userEvent.click(chip("行動", "飛ぶ"));
    await userEvent.click(screen.getAllByRole("button", { name: /写真を拡大/ })[0]);
    expect(screen.getByRole("link", { name: /撮影: 不明/ })).toBeInTheDocument();
  });
});

describe("App: 条件の横スライド", () => {
  it("条件が7枚のカードに分かれ、現在位置と回答済みが分かる", async () => {
    await renderApp();
    const dots = screen.getAllByRole("button", { name: /^\d\. / });
    expect(dots).toHaveLength(7);
    expect(dots[0]).toHaveClass("cur");
    expect(dots[6]).toHaveClass("done"); // 時間帯は現在時刻で回答済み
    await userEvent.click(chip("大きさ", "2"));
    expect(screen.getByRole("button", { name: "5. 大きさ" })).toHaveClass("done");
  });
  it("点をタップするとそのカードへ移動し、現在位置の表示が変わる", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "3. 行動" }));
    expect(screen.getByRole("button", { name: "3. 行動" })).toHaveClass("cur");
    expect(screen.getByText(/3\/7 行動/)).toBeInTheDocument();
  });
  it("スライドしたら、スクロール位置に応じて現在位置が変わる", async () => {
    await renderApp();
    const steps = document.querySelector(".steps") as HTMLElement;
    Object.defineProperty(steps, "scrollWidth", { configurable: true, value: 700 });
    Object.defineProperty(steps, "scrollLeft", { configurable: true, value: 200 });
    fireEvent.scroll(steps);
    expect(screen.getByRole("button", { name: "3. 行動" })).toHaveClass("cur");
  });
  it("幅が取れない環境ではスクロールしても現在位置を変えない", async () => {
    await renderApp();
    fireEvent.scroll(document.querySelector(".steps") as HTMLElement);
    expect(screen.getByRole("button", { name: "1. 周辺の環境" })).toHaveClass("cur");
  });
});

describe("App: 捕まえる・図鑑", () => {
  it("捕まえるとゲット演出が出て、図鑑に反映され、保存される", async () => {
    vi.useRealTimers(); // beforeEachのDateのみのフェイクを解除してから、setTimeoutも含めて偽装する
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 15, 7, 0, 0) });
    try {
      await renderApp();
      fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
      fireEvent.click(within(uguisuCard()).getByRole("button", { name: "捕まえる" }));
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(within(uguisuCard()).getByText(/NEW!/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /図鑑 1\/44/ })).toBeInTheDocument();
      expect(localStorage.getItem("bird-finder:collection:v1")).toContain("japanese_bush_warbler");
      fireEvent.click(screen.getByRole("button", { name: /図鑑 1\/44/ }));
      expect(screen.getByText("1 / 44 種を捕まえた")).toBeInTheDocument();
      expect(screen.getByText("ウグイス")).toBeInTheDocument();
      expect(screen.getAllByText("？？？")).toHaveLength(43);
    } finally {
      vi.useRealTimers();
    }
  });
  it("2回目は「もう一度捕まえる」で回数が増え、NEW!は出ない", async () => {
    localStorage.setItem("bird-finder:collection:v1", JSON.stringify({ japanese_bush_warbler: { firstAt: "2026-01-01T00:00:00.000Z", count: 1 } }));
    vi.useRealTimers(); // beforeEachのDateのみのフェイクを解除してから、setTimeoutも含めて偽装する
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 15, 7, 0, 0) });
    try {
      await renderApp();
      fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
      fireEvent.click(within(uguisuCard()).getByRole("button", { name: "もう一度捕まえる" }));
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(within(uguisuCard()).queryByText(/NEW!/)).toBeNull();
      expect(within(uguisuCard()).getByText(/2回目/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it("探すタブへ戻れる", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /図鑑/ }));
    await userEvent.click(screen.getByRole("button", { name: "探す" }));
    expect(screen.getByPlaceholderText(/ホーホケキョ/)).toBeInTheDocument();
  });
});
