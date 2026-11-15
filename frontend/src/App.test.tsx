import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const detectHabitats = vi.fn();
const getCoords = vi.fn();
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
vi.mock("./location", () => ({ detectHabitats: () => detectHabitats(), getCoords: () => getCoords() }));
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
  getCoords.mockReset().mockRejectedValue(new Error("位置なし"));
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
  it("大きさを選ぶと最大3件の候補を出し、検索結果は画像と近さの段階だけを表示する（詳細・理由は出さない）", async () => {
    await renderApp();
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "2" }));
    const items = within(screen.getByRole("list")).queryAllByRole("listitem");
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.querySelector(".badge")).toHaveTextContent(/かなり近い|近い|候補のひとつ/);
      expect(within(li).queryByText(/一致:/)).toBeNull();
      expect(within(li).queryByText(/鳴き声:/)).toBeNull();
      expect(li.textContent).not.toMatch(/%|％/); // 確率（パーセント）としては表示しない
    }
    expect(screen.queryByText(/確率ではありません/)).toBeNull(); // 注意文言は「ⓘ」のモーダルへ移した
  });
  it("写真がある鳥は画像だけ（名前は出さない）。写真が無い鳥は、枠に名前を出して見分けられるようにする", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    await renderApp();
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "2" }));
    const withPhoto = within(screen.getByRole("list")).getAllByRole("listitem")[0];
    expect(withPhoto.querySelector(".photo img")).not.toBeNull();
    expect(withPhoto.querySelector(".empty-name")).toBeNull();
    usePhoto.mockReturnValue(null);
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "3" })); // 再描画
    const noPhoto = within(screen.getByRole("list")).getAllByRole("listitem")[0];
    expect(noPhoto.querySelector(".empty-name")).toHaveTextContent(/.+/);
  });
  it("詳細は拡大表示に出る: 名前・近さ・説明・鳴き声・一致／不一致／未入力の理由", async () => {
    await renderApp();
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "2" }));
    fireEvent.click(firstCard());
    const box = document.querySelector(".lightbox") as HTMLElement;
    expect(box.querySelector(".lightbox-name")).toHaveTextContent(/.+/);
    expect(box.querySelector(".badge")).toHaveTextContent(/かなり近い|近い|候補のひとつ/);
    expect(within(box).getAllByText(/鳴き声:/).length).toBeGreaterThan(0);
    expect(within(box).getByText(/一致:/)).toBeInTheDocument();
    expect(within(box).getByText(/未入力:/)).toBeInTheDocument();
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
    expect(chips("行動")).not.toContain("飛ぶ・滑空する");
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
    fireEvent.click(firstCard()); // 理由は拡大表示（詳細）に出る
    expect(within(document.querySelector(".lightbox") as HTMLElement).getAllByText(/鳴き声（聞こえない）/).length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByText("アブラコウモリ").closest("li") as HTMLElement); // 説明は拡大表示（詳細）に出る
    expect(within(document.querySelector(".lightbox") as HTMLElement).getByText(/鳥ではなくコウモリ/)).toBeInTheDocument();
  });
});

describe("App: 行動の選択肢と絵文字", () => {
  it("行動は6つ（飛ぶは空のときだけ）: 泳ぐ／水の中に立つ・歩く／止まる・立つ・歩く／鳴く／採食／羽繕い", async () => {
    await renderApp();
    expect(chips("行動")).toEqual(["泳ぐ", "水の中に立つ・歩く", "止まる・立つ・歩く", "鳴く・歌う", "採食する・つつく", "羽繕いする"]);
  });
  it("見えない（声だけ）を選ぶと、鳴くが自動で選ばれる", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "見えない（声だけ）"));
    expect(chips("行動")).toEqual(["鳴く・歌う"]);
    expect(chip("行動", "鳴く")).toHaveClass("on");
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
    const big = document.querySelector(".lightbox .lb-large") as HTMLImageElement;
    expect(big.src).toContain("/500px-a.jpg");
    fireEvent.error(big);
    expect((document.querySelector(".lightbox .lb-large") as HTMLImageElement).src).toContain("/330px-a.jpg");
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
    await waitFor(() => expect(screen.getAllByText(/もう一度タップで停止/).length).toBeGreaterThan(0));
    expect(playAudio).toHaveBeenCalledWith("https://u/a.mp3", expect.any(Function));
    // 録音者・ライセンス・出典は、結果欄と拡大表示の両方に出る
    expect(screen.getAllByText(/録音者A ／ CC BY 4.0/).length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: "出典(Commons)" })) expect(link).toHaveAttribute("href", "https://c/File:a");
    expect(firstCard()).toHaveClass("playing");
  });
  it("探している間は「音源を探しています」を表示する", async () => {
    let resolve!: (v: unknown) => void;
    fetchCallAudio.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderApp();
    fireEvent.click(firstCard());
    expect((await screen.findAllByText(/音源を探しています/))[0]).toBeInTheDocument();
    await act(async () => resolve(null));
  });
  it("もう一度タップすると停止する", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    (await screen.findAllByText(/もう一度タップで停止/))[0];
    fireEvent.click(firstCard());
    expect(stopAudio).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryAllByText(/もう一度タップで停止/)).toHaveLength(0));
    expect(screen.queryByText(/鳥をタップすると鳴き声を再生します/)).toBeNull();
  });
  it("音源が見つからなければ理由を表示し、再生しない", async () => {
    fetchCallAudio.mockResolvedValue(null);
    await renderApp();
    fireEvent.click(firstCard());
    expect((await screen.findAllByText(/音源は見つかりませんでした/))[0]).toBeInTheDocument();
    expect(playAudio).not.toHaveBeenCalled();
  });
  it("再生が拒否されたら、対処を案内する", async () => {
    playAudio.mockRejectedValue(new Error("NotAllowedError"));
    await renderApp();
    fireEvent.click(firstCard());
    expect((await screen.findAllByText(/再生できませんでした/))[0]).toBeInTheDocument();
  });
  it("再生が終わると表示が元に戻る", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    (await screen.findAllByText(/もう一度タップで停止/))[0];
    const onEnded = playAudio.mock.calls[0][1] as () => void;
    act(() => onEnded());
    expect(screen.queryAllByText(/もう一度タップで停止/)).toHaveLength(0);
  });
  it("別の鳥をタップすると、そちらに切り替わる（古い取得結果は無視する）", async () => {
    let resolveFirst!: (v: unknown) => void;
    fetchCallAudio.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));
    await renderApp();
    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    (await screen.findAllByText(/もう一度タップで停止/))[0];
    await act(async () => resolveFirst({ src: "https://u/old.mp3", pageUrl: "x", title: "old" }));
    expect(playAudio).toHaveBeenCalledTimes(1);
    expect(playAudio.mock.calls[0][0]).toBe("https://u/a.mp3");
  });
  it("写真の拡大のボタンでは再生しない", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    await renderApp();
    fireEvent.click(within(firstCard()).getByRole("button", { name: /写真を拡大/ }));
    expect(unlockAudio).not.toHaveBeenCalled();
    expect(fetchCallAudio).not.toHaveBeenCalled();
  });
});

describe("App: タップで再生と同時に画像を拡大", () => {
  const photo = { thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" };
  it("カードをタップすると、再生と同時に写真が拡大され、名前と再生中の表示（録音者・ライセンス）が載る", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    const box = await waitFor(() => {
      const el = document.querySelector(".lightbox") as HTMLElement;
      expect(el).not.toBeNull();
      expect(within(el).getByText(/もう一度タップで停止/)).toBeInTheDocument();
      return el;
    });
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(box.querySelector(".lightbox-name")).toHaveTextContent(/.+/);
    expect(within(box).getByText(/録音者A ／ CC BY 4.0/)).toBeInTheDocument();
  });
  it("写真が無い鳥でも拡大表示（鳥の詳細）が開き、「写真なし」と再生中の表示が出る", async () => {
    usePhoto.mockReturnValue(null);
    await renderApp();
    fireEvent.click(firstCard());
    await waitFor(() => expect(within(document.querySelector(".lightbox") as HTMLElement).getAllByText(/もう一度タップで停止/).length).toBeGreaterThan(0));
    expect(within(document.querySelector(".lightbox") as HTMLElement).getByText("写真なし")).toBeInTheDocument();
  });
  it("拡大表示をタップすると閉じるが、音声は再生を続ける", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    await waitFor(() => expect(document.querySelector(".lightbox")).not.toBeNull());
    fireEvent.click(document.querySelector(".lightbox") as HTMLElement);
    expect(document.querySelector(".lightbox")).toBeNull();
    expect(stopAudio).not.toHaveBeenCalled();
    expect(screen.getAllByText(/もう一度タップで停止/).length).toBeGreaterThan(0);
  });
  it("再生中の鳥をもう一度タップすると、停止するだけで拡大しない", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    await waitFor(() => expect(document.querySelector(".lightbox")).not.toBeNull());
    fireEvent.click(document.querySelector(".lightbox") as HTMLElement);
    fireEvent.click(firstCard());
    expect(stopAudio).toHaveBeenCalled();
    expect(document.querySelector(".lightbox")).toBeNull();
  });
  it("別の鳥をタップすると、拡大も再生もそちらに切り替わる", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    fireEvent.click(cards[0]);
    await waitFor(() => expect(document.querySelectorAll(".lightbox")).toHaveLength(1));
    fireEvent.click(document.querySelector(".lightbox") as HTMLElement);
    fireEvent.click(cards[1]);
    await waitFor(() => expect(document.querySelectorAll(".lightbox")).toHaveLength(1));
    expect(cards[1].querySelector(".lightbox")).not.toBeNull();
    expect(cards[0].querySelector(".lightbox")).toBeNull();
  });
  it("写真の角の🔍ボタンは、音声なしで拡大のみ行う", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(within(firstCard()).getByRole("button", { name: /写真を拡大/ }));
    expect(document.querySelector(".lightbox")).not.toBeNull();
    expect(unlockAudio).not.toHaveBeenCalled();
    expect(screen.queryAllByText(/もう一度タップで停止/)).toHaveLength(0);
  });
});

describe("App: 拡大表示で、先に画像を出す", () => {
  const photo = { thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" };
  it("音源を探している間も、開いた瞬間に読み込み済みの小さい版が拡大して出る", async () => {
    usePhoto.mockReturnValue(photo);
    fetchCallAudio.mockReturnValue(new Promise(() => {})); // 音源の検索が終わらない
    await renderApp();
    fireEvent.click(firstCard());
    const box = document.querySelector(".lightbox") as HTMLElement;
    expect(box).not.toBeNull();
    expect((box.querySelector(".lb-thumb") as HTMLImageElement).src).toContain("/330px-a.jpg");
    expect(within(box).getAllByText(/音源を探しています/).length).toBeGreaterThan(0);
  });
  it("大きい版が読み込めるまでは重ねず、読み込めたら表示を切り替える", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    const large = document.querySelector(".lightbox .lb-large") as HTMLImageElement;
    expect(large).not.toHaveClass("on");
    fireEvent.load(large);
    expect(document.querySelector(".lightbox .lb-large")).toHaveClass("on");
  });
  it("大きい版が失敗しても、小さい版が出たまま（失敗した大きい版は重ならない）", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    fireEvent.error(document.querySelector(".lightbox .lb-large") as HTMLElement);
    expect(document.querySelector(".lightbox .lb-thumb")).not.toBeNull();
    expect(document.querySelector(".lightbox .lb-large")).not.toHaveClass("on");
  });
  it("飛翔の写真は、大きい版が無いため、同じ画像を使う", async () => {
    useFlightPhoto.mockReturnValue({ thumbnail: "https://c/500px-fly.jpg", pageUrl: "https://c/x", flight: true });
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    fireEvent.click(firstCard());
    expect((document.querySelector(".lightbox .lb-large") as HTMLImageElement).src).toContain("/500px-fly.jpg");
    expect((document.querySelector(".lightbox .lb-thumb") as HTMLImageElement).src).toContain("/500px-fly.jpg");
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
    await userEvent.click(chip("どこで見たか", "空"));
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
    await userEvent.click(chip("どこで見たか", "空"));
    await userEvent.click(screen.getAllByRole("button", { name: /写真を拡大/ })[0]);
    expect(screen.getByRole("link", { name: /撮影: 不明/ })).toBeInTheDocument();
  });
});

describe("App: 注意文言のモーダル", () => {
  it("注意文言は画面に出さず、ⓘを押すとモーダルで見られ、閉じられる", async () => {
    await renderApp();
    expect(screen.queryByText(/点数順の目安/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "使い方と注意" }));
    const dialog = screen.getByRole("dialog", { name: "使い方と注意" });
    expect(within(dialog).getByText(/確率ではありません/)).toBeInTheDocument();
    expect(within(dialog).getByText(/暫定値/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "使い方と注意" })).toBeNull();
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

const detail = () => document.querySelector(".lightbox") as HTMLElement;
const openDetail = async () => {
  fireEvent.click(uguisuCard());
  await waitFor(() => expect(detail()).not.toBeNull());
};

describe("App: 捕まえる・図鑑", () => {
  it("検索結果のカードには「捕まえる」ボタンが無い", async () => {
    await renderApp();
    fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
    expect(screen.queryAllByRole("button", { name: /捕まえる/ })).toHaveLength(0);
  });
  it("鳥の拡大表示で捕まえると、ゲット演出が出て、図鑑に反映され、保存される", async () => {
    vi.useRealTimers(); // beforeEachのDateのみのフェイクを解除してから、setTimeoutも含めて偽装する
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 15, 7, 0, 0) });
    try {
      await renderApp();
      fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
      await openDetail();
      fireEvent.click(within(detail()).getByRole("button", { name: "捕まえる" }));
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(within(detail()).getByText(/NEW!/)).toBeInTheDocument();
      expect(detail()).not.toBeNull(); // ボタンを押しても拡大表示は閉じない
      expect(screen.getByRole("button", { name: /図鑑 1\/44/ })).toBeInTheDocument();
      expect(localStorage.getItem("bird-finder:collection:v1")).toContain("japanese_bush_warbler");
      fireEvent.click(detail()); // 背景をタップして閉じる
      expect(detail()).toBeNull();
      expect(within(uguisuCard()).getByRole("img", { name: "捕獲済み" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /図鑑 1\/44/ }));
      expect(screen.getByText("1 / 44 種を捕まえた")).toBeInTheDocument();
      expect(screen.getByText("ウグイス")).toBeInTheDocument();
      expect(screen.getAllByText("？？？")).toHaveLength(43);
    } finally {
      vi.useRealTimers();
    }
  });
  it("写真が無い鳥でも、拡大表示を開いて捕まえられる", async () => {
    usePhoto.mockReturnValue(null);
    await renderApp();
    fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
    await openDetail();
    expect(within(detail()).getAllByText("写真なし").length).toBeGreaterThan(0);
    expect(within(detail()).getByRole("button", { name: "捕まえる" })).toBeInTheDocument();
  });
  it("2回目は「もう一度捕まえる」で回数が増え、NEW!は出ない", async () => {
    localStorage.setItem("bird-finder:collection:v1", JSON.stringify({ japanese_bush_warbler: { firstAt: "2026-01-01T00:00:00.000Z", count: 1 } }));
    vi.useRealTimers(); // beforeEachのDateのみのフェイクを解除してから、setTimeoutも含めて偽装する
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 15, 7, 0, 0) });
    try {
      await renderApp();
      fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
      await openDetail();
      fireEvent.click(within(detail()).getByRole("button", { name: "もう一度捕まえる" }));
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(within(detail()).queryByText(/NEW!/)).toBeNull();
      expect(within(detail()).getByText(/2回目/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it("捕まえ済みの鳥のカードには「捕獲済み」の印が出て、未捕獲の鳥には出ない", async () => {
    localStorage.setItem("bird-finder:collection:v1", JSON.stringify({ japanese_bush_warbler: { firstAt: "2026-01-01T00:00:00.000Z", count: 1 } }));
    await renderApp();
    fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
    expect(within(uguisuCard()).getByRole("img", { name: "捕獲済み" })).toBeInTheDocument();
    const others = within(screen.getByRole("list")).getAllByRole("listitem").filter((li) => li !== uguisuCard());
    for (const li of others) expect(within(li).queryByRole("img", { name: "捕獲済み" })).toBeNull();
  });
  it("図鑑タブに、自宅の登録（共有から除外）が表示される", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /図鑑/ }));
    expect(screen.getByRole("heading", { name: /自宅の登録（共有から除外）/ })).toBeInTheDocument();
  });
  it("捕まえたとき現在地が取れれば、見つけた場所つきで記録され、地図タブにピンが出る（位置はぼかされる）", async () => {
    getCoords.mockResolvedValue({ lat: 35.6506, lon: 139.5407 });
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 15, 7, 0, 0) });
    try {
      await renderApp();
      fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
      await openDetail();
      fireEvent.click(within(detail()).getByRole("button", { name: "捕まえる" }));
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      const saved = JSON.parse(localStorage.getItem("bird-finder:sightings:v1") ?? "[]");
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ speciesId: "japanese_bush_warbler", date: "2026-11-15", lat: 35.6506, lon: 139.5407 });
      fireEvent.click(detail());
      fireEvent.click(screen.getByRole("button", { name: /地図/ }));
      expect(await screen.findByTestId("map-canvas")).toBeInTheDocument();
      await waitFor(() => expect(document.querySelectorAll(".bird-pin")).toHaveLength(1));
      expect(document.body.textContent).not.toContain("35.6506"); // 正確な位置は地図に出さない
    } finally {
      vi.useRealTimers();
    }
  });
  it("現在地が取れなかった捕獲は位置なしで記録され、地図に出せない旨を案内する", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 15, 7, 0, 0) });
    try {
      await renderApp();
      fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
      await openDetail();
      fireEvent.click(within(detail()).getByRole("button", { name: "捕まえる" }));
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      fireEvent.click(detail());
      fireEvent.click(screen.getByRole("button", { name: /地図/ }));
      expect(await screen.findByText(/位置が取れなかった記録が1件あります/)).toBeInTheDocument();
      expect(document.querySelectorAll(".bird-pin")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("地図タブには出典と、記録が無いときの案内が出る。探すタブへ戻れる", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /地図/ }));
    expect(await screen.findByText(/見つけた場所つきの記録がありません/)).toBeInTheDocument();
    expect(document.querySelector(".leaflet-control-attribution")).toHaveTextContent("OpenStreetMap");
    await userEvent.click(screen.getByRole("button", { name: "探す" }));
    expect(screen.getByPlaceholderText(/ホーホケキョ/)).toBeInTheDocument();
  });
  it("探すタブへ戻れる", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /図鑑/ }));
    await userEvent.click(screen.getByRole("button", { name: "探す" }));
    expect(screen.getByPlaceholderText(/ホーホケキョ/)).toBeInTheDocument();
  });
});
