import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectHabitats, usePhoto, fetchCallAudio, playAudio, stopAudio, unlockAudio, chip, detail, firstCard, renderApp, renderAppNoWait, setupAppTests } from "./testApp";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);

setupAppTests();

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
  it("詳細を閉じると、再生が止まる（#133）", async () => {
    await renderApp();
    fireEvent.click(firstCard()); // 鳥をタップすると、詳細が開き、鳴き声が再生される
    await waitFor(() => expect(detail()).not.toBeNull());
    await waitFor(() => expect(playAudio).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(detail()).getAllByText(/もう一度タップで停止/).length).toBeGreaterThan(0));
    stopAudio.mockClear();
    fireEvent.click(within(detail()).getByRole("button", { name: "閉じる" }));
    expect(detail()).toBeNull();
    expect(stopAudio).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryAllByText(/もう一度タップで停止/)).toHaveLength(0));
  });
  it("音源を探している最中に詳細を閉じると、あとから再生が始まらない（#133）", async () => {
    let resolve!: (v: unknown) => void;
    fetchCallAudio.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderApp();
    fireEvent.click(firstCard());
    await waitFor(() => expect(detail()).not.toBeNull());
    expect((await screen.findAllByText(/音源を探しています/))[0]).toBeInTheDocument();
    fireEvent.click(within(detail()).getByRole("button", { name: "閉じる" }));
    await act(async () => resolve({ src: "https://u/late.mp3", pageUrl: "https://c/File:late", title: "late.ogg" }));
    expect(playAudio).not.toHaveBeenCalled();
  });
  it("もう一度タップすると停止する", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    await screen.findAllByText(/もう一度タップで停止/);
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
    await screen.findAllByText(/もう一度タップで停止/);
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
    await screen.findAllByText(/もう一度タップで停止/);
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
  it("拡大表示を閉じると、再生も止まる（背景のタップでも）（#133）", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    await waitFor(() => expect(document.querySelector(".lightbox")).not.toBeNull());
    await waitFor(() => expect(playAudio).toHaveBeenCalledTimes(1));
    stopAudio.mockClear();
    fireEvent.click(document.querySelector(".lightbox") as HTMLElement);
    expect(document.querySelector(".lightbox")).toBeNull();
    expect(stopAudio).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryAllByText(/もう一度タップで停止/)).toHaveLength(0));
  });
  it("閉じたあとに同じ鳥をもう一度タップすると、また再生して拡大する", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    await waitFor(() => expect(document.querySelector(".lightbox")).not.toBeNull());
    fireEvent.click(document.querySelector(".lightbox") as HTMLElement);
    fireEvent.click(firstCard());
    await waitFor(() => expect(document.querySelector(".lightbox")).not.toBeNull());
    await waitFor(() => expect(playAudio).toHaveBeenCalledTimes(2));
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

describe("App: オフライン（#70）", () => {
  const goOffline = () => vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  afterEach(() => vi.restoreAllMocks());

  it("オフラインの案内は、オフラインのときだけ出る", async () => {
    await renderApp();
    expect(screen.queryByText(/オフラインです/)).toBeNull();
    const spy = goOffline();
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status")).toHaveTextContent("オフラインです。鳥の判定は使えます");
    spy.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.queryByText(/オフラインです/)).toBeNull();
  });
  it("すべての通信が失敗する状態でも、条件を入力すれば候補が出る（判定は端末内で完結する）", async () => {
    goOffline();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await renderAppNoWait();
    await act(async () => {});
    expect(detectHabitats).not.toHaveBeenCalled(); // 通信を試みない
    expect(screen.getByText(/オフラインのため、周辺の環境を判定できません/)).toBeInTheDocument();
    await userEvent.click(chip("大きさ", "2"));
    expect(within(screen.getByRole("list")).getAllByRole("listitem").length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
  it("オフラインで鳥をタップすると、音源を探さず、理由を表示する", async () => {
    await renderApp();
    await userEvent.click(chip("大きさ", "2"));
    goOffline();
    fireEvent.click(firstCard());
    expect(await screen.findAllByText(/オフラインのため、.+の鳴き声は再生できません/)).not.toHaveLength(0);
    expect(fetchCallAudio).not.toHaveBeenCalled();
    expect(unlockAudio).toHaveBeenCalled(); // iOSの解錠は、タップの同期処理で行う
  });
});
