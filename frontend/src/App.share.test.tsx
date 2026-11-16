import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCoords, detail, openDetail, renderApp, setupAppTests } from "./testApp";
import { saveHome } from "./storage";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);
const postSighting = vi.fn();
vi.mock("./api", () => ({ postSighting: (b: unknown) => postSighting(b), fetchSightings: vi.fn().mockResolvedValue([]) }));

setupAppTests();
beforeEach(() => postSighting.mockReset().mockResolvedValue(undefined));

const EXACT = { lat: 35.6506, lon: 139.5407 };

/** ウグイスの拡大表示を開き、捕まえる演出を最後まで進める */
async function catchUguisu(share: boolean) {
  vi.useRealTimers();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 15, 7, 0, 0) });
  await renderApp();
  fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
  await openDetail();
  if (share) await userEvent.click(within(detail()).getByRole("checkbox", { name: /みんなに共有/ }));
  fireEvent.click(within(detail()).getByRole("button", { name: "捕まえる" }));
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
}

describe("App: みんなに共有（#46）", () => {
  it("共有のチェックは初期オフ。オンにすると、ぼかし・自宅の除外・取り消せない・期限なく保存を説明する", async () => {
    await renderApp();
    fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
    await openDetail();
    const box = within(detail()).getByRole("checkbox", { name: /みんなに共有/ });
    expect(box).not.toBeChecked();
    expect(within(detail()).queryByText(/あとから取り消せません/)).toBeNull();
    await userEvent.click(box);
    const note = within(detail()).getByText(/あとから取り消せません/);
    expect(note).toHaveTextContent("約1kmにぼかした位置");
    expect(note).toHaveTextContent("自宅の周辺（約2km）は共有しません");
    expect(note).toHaveTextContent("期限なく保存されます");
  });
  it("共有しない（初期のまま）なら、何も送らない", async () => {
    getCoords.mockResolvedValue(EXACT);
    await catchUguisu(false);
    expect(postSighting).not.toHaveBeenCalled();
  });
  it("共有を選ぶと、種・日付・ぼかした位置だけを送る（正確な位置は送らない）", async () => {
    getCoords.mockResolvedValue(EXACT);
    await catchUguisu(true);
    await waitFor(() => expect(postSighting).toHaveBeenCalledOnce());
    const sent = postSighting.mock.calls[0][0];
    expect(Object.keys(sent).sort()).toEqual(["date", "lat", "lon", "speciesId"]);
    expect(sent.speciesId).toBe("japanese_bush_warbler");
    expect(sent.date).toBe("2026-11-15");
    expect(sent.lat).not.toBe(EXACT.lat);
    expect(sent.lon).not.toBe(EXACT.lon);
    expect(Math.abs(sent.lat - EXACT.lat)).toBeLessThan(0.02); // 約1km＋ずらしの範囲
    expect(await within(detail()).findByText(/みんなに共有しました/)).toBeInTheDocument();
  });
  it("自宅の周辺（約2km以内）は、共有せず理由を表示する", async () => {
    saveHome({ lat: 35.651, lon: 139.541 });
    getCoords.mockResolvedValue(EXACT);
    await catchUguisu(true);
    expect(await within(detail()).findByText("自宅の周辺（約2km以内）は共有しません")).toBeInTheDocument();
    expect(postSighting).not.toHaveBeenCalled();
  });
  it("位置が取れなければ、共有せず理由を表示する", async () => {
    await catchUguisu(true); // getCoordsは既定で失敗する
    expect(await within(detail()).findByText(/位置が取得できていないため、共有できません/)).toBeInTheDocument();
    expect(postSighting).not.toHaveBeenCalled();
  });
  it("送信に失敗したら理由を表示し、Error以外は既定の文言", async () => {
    getCoords.mockResolvedValue(EXACT);
    postSighting.mockRejectedValueOnce(new Error("1日の投稿上限に達しました"));
    await catchUguisu(true);
    expect(await within(detail()).findByText("1日の投稿上限に達しました")).toBeInTheDocument();
  });
  it("Error以外が投げられても既定の文言を表示する", async () => {
    getCoords.mockResolvedValue(EXACT);
    postSighting.mockRejectedValueOnce("x");
    await catchUguisu(true);
    expect(await within(detail()).findByText("共有できませんでした")).toBeInTheDocument();
  });
});
