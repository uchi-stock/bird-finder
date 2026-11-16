import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSharedSightings } from "./useSharedSightings";

const fetchSightings = vi.fn();
vi.mock("../api", () => ({ fetchSightings: (t: string[]) => fetchSightings(t) }));

const near = { south: 35.651, west: 139.541, north: 35.652, east: 139.542 };
const wide = { south: 35, west: 139, north: 36, east: 140 };

beforeEach(() => fetchSightings.mockReset());

describe("useSharedSightings", () => {
  it("表示範囲の区画を取得し、ピンにまとめる", async () => {
    fetchSightings.mockResolvedValue([{ speciesId: "sparrow", date: "2026-11-15", lat: 35.651, lon: 139.541 }]);
    const { result } = renderHook(() => useSharedSightings());
    await act(() => result.current.load(near));
    expect(fetchSightings).toHaveBeenCalledWith(["713:2790"]);
    expect(result.current.points).toHaveLength(1);
    expect(result.current.message).toBe("");
    expect(result.current.loading).toBe(false);
  });
  it("記録が無ければ案内を出す", async () => {
    fetchSightings.mockResolvedValue([]);
    const { result } = renderHook(() => useSharedSightings());
    await act(() => result.current.load(near));
    expect(result.current.message).toContain("まだ共有された観察がありません");
  });
  it("地図が広すぎるときは取得せず、拡大を案内する", async () => {
    const { result } = renderHook(() => useSharedSightings());
    await act(() => result.current.load(wide));
    expect(fetchSightings).not.toHaveBeenCalled();
    expect(result.current.message).toContain("拡大");
  });
  it("取得に失敗したら理由を出し、Error以外は既定の文言", async () => {
    fetchSightings.mockRejectedValueOnce(new Error("オフラインのため、みんなの観察を取得できません")).mockRejectedValueOnce("x");
    const { result } = renderHook(() => useSharedSightings());
    await act(() => result.current.load(near));
    expect(result.current.message).toContain("オフライン");
    await act(() => result.current.load(near));
    expect(result.current.message).toBe("みんなの観察を取得できませんでした");
  });
  it("古い取得結果は、新しい取得の結果を上書きしない", async () => {
    let first!: (v: unknown) => void;
    fetchSightings.mockReturnValueOnce(new Promise((r) => (first = r))).mockResolvedValueOnce([{ speciesId: "mallard", date: "2026-11-15", lat: 35.651, lon: 139.541 }]);
    const { result } = renderHook(() => useSharedSightings());
    let p1!: Promise<void>;
    act(() => void (p1 = result.current.load(near)));
    await act(() => result.current.load(near));
    await act(async () => {
      first([{ speciesId: "sparrow", date: "2026-11-15", lat: 35.651, lon: 139.541 }]);
      await p1;
    });
    expect(result.current.points[0].speciesId).toBe("mallard");
  });
});
