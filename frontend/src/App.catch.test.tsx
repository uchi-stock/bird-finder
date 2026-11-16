import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getCoords, usePhoto, uguisuCard, detail, openDetail, renderApp, setupAppTests } from "./testApp";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);

setupAppTests();

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
