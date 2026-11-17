import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

// Appのテスト（App.*.test.tsx）の共通部品。外部への依存（現在地・写真・音源）の偽物と、よく使う操作をまとめる

export const detectHabitats = vi.fn();
export const getCoords = vi.fn();
export const usePhoto = vi.fn();
export const usePhotoFailed = vi.fn();
export const retryPhoto = vi.fn();
export const fetchCallAudio = vi.fn();
export const playAudio = vi.fn();
export const stopAudio = vi.fn();
export const unlockAudio = vi.fn();
export const useFlightPhoto = vi.fn();

// 各テストファイルが、vi.mockのファクトリから参照する（vi.mockはファイルの先頭へ巻き上げられるため、動的importで渡す）
export const callAudioMock = {
  fetchCallAudio: (s: string) => fetchCallAudio(s),
  playAudio: (src: string, end: () => void) => playAudio(src, end),
  stopAudio: () => stopAudio(),
  unlockAudio: () => unlockAudio(),
};
export const locationMock = { detectHabitats: () => detectHabitats(), getCoords: () => getCoords() };
export const photoMock = {
  usePhoto: (n: string) => usePhoto(n),
  usePhotoFailed: (n: string) => usePhotoFailed(n),
  retryPhoto: (n: string) => retryPhoto(n),
  useFlightPhoto: (s: string, e: boolean) => useFlightPhoto(s, e),
};

export const section = (title: string) => screen.getByRole("heading", { name: new RegExp(title) }).closest("section") as HTMLElement;
export const uguisuCard = () => screen.getByText("ウグイス").closest("li") as HTMLElement;
// 絵文字（aria-hidden）を除いたボタンの文字
export const labelOf = (b: HTMLElement) =>
  Array.from(b.childNodes)
    .filter((n) => !(n instanceof HTMLElement && n.getAttribute("aria-hidden") === "true"))
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();
export const chips = (title: string) => within(section(title)).getAllByRole("button").map(labelOf);
export const chip = (title: string, label: string) => within(section(title)).getByRole("button", { name: new RegExp(label) });
export const firstCard = () => within(screen.getByRole("list")).getAllByRole("listitem")[0];
export const detail = () => document.querySelector(".lightbox") as HTMLElement;
export const openDetail = async () => {
  fireEvent.click(uguisuCard());
  await waitFor(() => expect(detail()).not.toBeNull());
};

/** 各テストファイルの先頭で1回呼ぶ。時刻と偽物の初期値をそろえる */
export function setupAppTests() {
  beforeEach(() => {
    // 時間帯の初期値（現在時刻）を固定する: 朝7時
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 15, 7, 0, 0));
    localStorage.clear();
    detectHabitats.mockReset().mockResolvedValue([]);
    getCoords.mockReset().mockRejectedValue(new Error("位置なし"));
    usePhoto.mockReset().mockReturnValue(null);
    usePhotoFailed.mockReset().mockReturnValue(false);
    retryPhoto.mockReset();
    useFlightPhoto.mockReset().mockReturnValue(null);
    fetchCallAudio.mockReset().mockResolvedValue({ src: "https://u/a.mp3", pageUrl: "https://c/File:a", title: "a.ogg", credit: "録音者A", license: "CC BY 4.0" });
    playAudio.mockReset().mockResolvedValue(undefined);
    stopAudio.mockReset();
    unlockAudio.mockReset();
  });
  afterEach(() => vi.useRealTimers());
}

// Appは、偽物（vi.mock）が効いてから読み込む
export async function renderAppNoWait() {
  const { App } = await import("./App");
  return render(<App />);
}

export async function renderApp() {
  const view = await renderAppNoWait();
  await waitFor(() => expect(detectHabitats).toHaveBeenCalled());
  await act(async () => {});
  return view;
}
/** ヘッダーのメニュー（☰）を開く */
export const openMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: "メニュー" }));
};
/** メニューから「使い方と注意」を開く */
export const openHelp = async () => {
  await openMenu();
  await userEvent.click(screen.getByRole("button", { name: "使い方と注意" }));
};
