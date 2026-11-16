import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isOnlineNow, useOnline } from "./useOnline";

afterEach(() => vi.restoreAllMocks());

describe("useOnline", () => {
  it("初期値はnavigator.onLine。online / offline イベントで切り替わる", () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    spy.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
    expect(isOnlineNow()).toBe(false);
    spy.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });
  it("onLineが使えない環境では、常にオンライン扱いにする", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(undefined as unknown as boolean);
    expect(isOnlineNow()).toBe(true);
  });
});
