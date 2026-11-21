import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { gotoTab, playAudio, renderApp, setupAppTests, stopAudio, unlockAudio, usePhoto } from "./testApp";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);

setupAppTests();

const openAll = async () => {
  await renderApp();
  await gotoTab(/図鑑/);
  await userEvent.click(screen.getByRole("button", { name: "全種の一覧" }));
  return screen.getByRole("list", { name: "全種の一覧" });
};

describe("App: 全種の一覧（#96）", () => {
  it("図鑑タブに切り替えがあり、初期は集めた鳥。全種の一覧を選ぶと、全44種が行で並ぶ", async () => {
    await renderApp();
    await gotoTab(/図鑑/);
    expect(screen.getByRole("button", { name: "集めた鳥" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("list", { name: "全種の一覧" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "全種の一覧" }));
    expect(screen.getByRole("button", { name: "全種の一覧" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("list", { name: "全種の一覧" })).getAllByRole("listitem")).toHaveLength(44);
    await userEvent.click(screen.getByRole("button", { name: "集めた鳥" }));
    expect(screen.queryByRole("list", { name: "全種の一覧" })).toBeNull();
  });
  it("各行に、名前・学名・大きさ・色・出現頻度・データの確度が出る。五十音順に並ぶ", async () => {
    const list = await openAll();
    const rows = within(list).getAllByRole("listitem");
    const names = rows.map((r) => r.querySelector("strong")?.textContent?.replace("✅", "") ?? "");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ja")));
    const uguisu = rows.find((r) => r.textContent?.includes("ウグイス"))!;
    expect(uguisu).toHaveTextContent("Horornis diphone");
    expect(uguisu).toHaveTextContent("大きさ 3（ツバメくらい）");
    expect(uguisu).toHaveTextContent("茶");
    expect(uguisu).toHaveTextContent("出現: 普通");
    expect(uguisu).toHaveTextContent("データ: 未確認");
  });
  it("各行の頭に鳥の画像が出る。写真が無ければ「写真なし」の枠に名前を出す", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    const list = await openAll();
    const imgs = list.querySelectorAll(".sp-photo .photo img");
    expect(imgs.length).toBe(44);
    expect(imgs[0]).toHaveAttribute("src", "https://u/330px-a.jpg");
  });
  it("画像の🔍で拡大表示が開き、説明・鳴き声・捕まえるがある。捕まえた鳥には✅が付く", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    const list = await openAll();
    fireEvent.click(within(list).getByRole("button", { name: "ウグイスの写真を拡大" }));
    const dialog = await screen.findByRole("dialog", { name: "ウグイスの詳細" });
    expect(within(dialog).getByText(/鳴き声:/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "捕まえる" })).toBeInTheDocument();
    expect(within(list).queryByRole("img", { name: "捕獲済み" })).toBeNull();
  });
  it("捕獲済みの鳥の行に、捕獲済みの印が出る", async () => {
    localStorage.setItem("bird-finder:collection:v1", JSON.stringify({ japanese_bush_warbler: { count: 2, firstAt: "2026-11-15T07:00:00.000Z" } }));
    const list = await openAll();
    expect(within(list).getAllByRole("img", { name: "捕獲済み" })).toHaveLength(1);
  });
  it("行をタップすると、詳細が開いて鳴き声が再生される。閉じると止まる（#141）", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    const list = await openAll();
    const row = within(list).getAllByRole("listitem").find((r) => r.textContent?.includes("ウグイス"))!;
    fireEvent.click(row.querySelector(".sp-info") as HTMLElement);
    expect(unlockAudio).toHaveBeenCalledTimes(1); // タップの同期処理内で解錠する
    const dialog = await screen.findByRole("dialog", { name: "ウグイスの詳細" });
    await waitFor(() => expect(playAudio).toHaveBeenCalledWith("https://u/a.mp3", expect.any(Function)));
    // 再生中の表示と出典が、詳細に出る
    await waitFor(() => expect(within(dialog).getAllByText(/録音者A ／ CC BY 4.0/).length).toBeGreaterThan(0));
    stopAudio.mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(stopAudio).toHaveBeenCalledTimes(1);
  });
  it("行の中のボタン（画像の🔍）は、再生せずに拡大するだけ（従来どおり）", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    const list = await openAll();
    fireEvent.click(within(list).getByRole("button", { name: "ウグイスの写真を拡大" }));
    await screen.findByRole("dialog", { name: "ウグイスの詳細" });
    expect(unlockAudio).not.toHaveBeenCalled();
    expect(playAudio).not.toHaveBeenCalled();
  });
});
