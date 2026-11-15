import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const detectHabitats = vi.fn();
const usePhoto = vi.fn();
vi.mock("./location", () => ({ detectHabitats: () => detectHabitats() }));
vi.mock("./photo", () => ({ usePhoto: (n: string) => usePhoto(n) }));

const section = (title: string) => screen.getByRole("heading", { name: new RegExp(title) }).closest("section") as HTMLElement;
const uguisuCard = () => screen.getByText("ウグイス").closest("li") as HTMLElement;
const chips = (title: string) => within(section(title)).getAllByRole("button").map((b) => b.textContent ?? "");
const chip = (title: string, label: string) => within(section(title)).getByRole("button", { name: new RegExp(label) });

beforeEach(() => {
  // 時間帯の初期値（現在時刻）を固定する: 朝7時
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 7, 0, 0));
  localStorage.clear();
  detectHabitats.mockReset().mockResolvedValue([]);
  usePhoto.mockReset().mockReturnValue(null);
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
      expect(screen.getByRole("button", { name: /図鑑 1\/43/ })).toBeInTheDocument();
      expect(localStorage.getItem("bird-finder:collection:v1")).toContain("japanese_bush_warbler");
      fireEvent.click(screen.getByRole("button", { name: /図鑑 1\/43/ }));
      expect(screen.getByText("1 / 43 種を捕まえた")).toBeInTheDocument();
      expect(screen.getByText("ウグイス")).toBeInTheDocument();
      expect(screen.getAllByText("？？？")).toHaveLength(42);
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
