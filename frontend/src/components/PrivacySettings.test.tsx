import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacySettings } from "./PrivacySettings";
import { loadHome } from "../storage";

const getCoords = vi.fn();
vi.mock("../location", () => ({ getCoords: () => getCoords() }));

beforeEach(() => {
  localStorage.clear();
  getCoords.mockReset();
});

describe("PrivacySettings（自宅の登録）", () => {
  it("説明と、自宅は端末の中にだけ保存し送信しない旨を表示する", () => {
    render(<PrivacySettings />);
    expect(screen.getByText(/端末の中にだけ保存し、送信しません/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "現在地を自宅として登録" })).toBeInTheDocument();
  });
  it("現在地を自宅として登録できる（端末内にだけ保存される）", async () => {
    getCoords.mockResolvedValue({ lat: 35.65, lon: 139.54 });
    render(<PrivacySettings />);
    fireEvent.click(screen.getByRole("button", { name: "現在地を自宅として登録" }));
    expect(await screen.findByText("自宅: 登録済み")).toBeInTheDocument();
    expect(screen.getByText("現在地を自宅として登録しました")).toBeInTheDocument();
    expect(loadHome()).toEqual({ lat: 35.65, lon: 139.54 });
  });
  it("取得中は押せない表示になる", async () => {
    let resolve!: (v: unknown) => void;
    getCoords.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<PrivacySettings />);
    fireEvent.click(screen.getByRole("button", { name: "現在地を自宅として登録" }));
    expect(await screen.findByRole("button", { name: "取得中…" })).toBeDisabled();
    resolve({ lat: 35.6, lon: 139.5 });
    await screen.findByText("自宅: 登録済み");
  });
  it("位置が取得できなければ理由を表示し、登録しない", async () => {
    getCoords.mockRejectedValue(new Error("位置情報の利用が許可されていません"));
    render(<PrivacySettings />);
    fireEvent.click(screen.getByRole("button", { name: "現在地を自宅として登録" }));
    expect(await screen.findByText("位置情報の利用が許可されていません")).toBeInTheDocument();
    expect(loadHome()).toBeNull();
  });
  it("Error以外が投げられても既定の文言を表示する", async () => {
    getCoords.mockRejectedValue("x");
    render(<PrivacySettings />);
    fireEvent.click(screen.getByRole("button", { name: "現在地を自宅として登録" }));
    expect(await screen.findByText("現在地を取得できませんでした")).toBeInTheDocument();
  });
  it("保存できない端末では、その旨を表示し登録済みにしない", async () => {
    getCoords.mockResolvedValue({ lat: 35.6, lon: 139.5 });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PrivacySettings />);
    fireEvent.click(screen.getByRole("button", { name: "現在地を自宅として登録" }));
    expect(await screen.findByText("この端末では保存できませんでした")).toBeInTheDocument();
    expect(screen.queryByText("自宅: 登録済み")).toBeNull();
    vi.restoreAllMocks();
  });
  it("登録済みなら表示され、削除できる", async () => {
    localStorage.setItem("bird-finder:home:v1", JSON.stringify({ lat: 35.6, lon: 139.5 }));
    render(<PrivacySettings />);
    expect(screen.getByText("自宅: 登録済み")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "登録を削除" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "現在地を自宅として登録" })).toBeInTheDocument());
    expect(loadHome()).toBeNull();
    expect(screen.getByText("自宅の登録を削除しました")).toBeInTheDocument();
  });
});
