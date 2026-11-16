import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MapView from "./MapView";
import type { MapPoint } from "../domain/sightings";

const label = (id: string) => ({ name: id === "bat" ? "アブラコウモリ" : "スズメ", emoji: id === "bat" ? "🦇" : "🐦" });
const pt = (over: Partial<MapPoint> = {}): MapPoint => ({ key: "k", speciesId: "sparrow", date: "2026-11-15", lat: 35.65, lon: 139.54, count: 1, ...over });
const locate = vi.fn();

describe("MapView", () => {
  it("記録が無ければ案内を出し、地図の出典（地理院・OpenStreetMap）を表示する", () => {
    const { container } = render(<MapView points={[]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    expect(screen.getByRole("status")).toHaveTextContent("見つけた場所つきの記録がありません");
    expect(container.querySelector(".leaflet-control-attribution")).toHaveTextContent("地理院タイル");
    expect(container.querySelector(".leaflet-control-attribution")).toHaveTextContent("© OpenStreetMap contributors");
  });
  it("点ごとにピンを出し、件数が複数なら件数を付ける", () => {
    const { container } = render(<MapView points={[pt(), pt({ key: "k2", speciesId: "bat", lat: 35.7, lon: 139.6, count: 3 })]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    expect(container.querySelectorAll(".bird-pin")).toHaveLength(2);
    expect(container.querySelector(".pin-count")).toHaveTextContent("3");
    expect(container.textContent).toContain("🦇");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("ピンをタップすると、鳥の名前・日付・件数・ぼかしの範囲を表示する", async () => {
    const { container } = render(<MapView points={[pt({ count: 2 })]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    fireEvent.click(container.querySelector(".bird-pin") as HTMLElement);
    await waitFor(() => expect(container.querySelector(".leaflet-popup-content")).not.toBeNull());
    expect(container.querySelector(".leaflet-popup-content")).toHaveTextContent("スズメ");
    expect(container.querySelector(".leaflet-popup-content")).toHaveTextContent("2026-11-15・2件（約1kmの範囲）");
  });
  it("点が変わると、ピンが入れ替わる", () => {
    const { container, rerender } = render(<MapView points={[pt()]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    expect(container.querySelectorAll(".bird-pin")).toHaveLength(1);
    rerender(<MapView points={[pt(), pt({ key: "b", lat: 35.8 }), pt({ key: "c", lat: 35.9 })]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    expect(container.querySelectorAll(".bird-pin")).toHaveLength(3);
  });
  it("位置の無い記録がある場合は、件数と理由を案内する", () => {
    render(<MapView points={[pt()]} speciesLabel={label} withoutLocation={2} locate={locate} />);
    expect(screen.getByText(/位置が取れなかった記録が2件あります/)).toBeInTheDocument();
  });
  it("現在地へ移動でき、青い印が出る。2回目は印を置き換える", async () => {
    locate.mockResolvedValue({ lat: 35.66, lon: 139.55 });
    const { container } = render(<MapView points={[]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    fireEvent.click(screen.getByRole("button", { name: "現在地へ" }));
    await waitFor(() => expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "現在地へ" }));
    await waitFor(() => expect(locate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(1));
  });
  it("取得中は押せず、失敗したら理由を表示する", async () => {
    let reject!: (e: unknown) => void;
    locate.mockReturnValue(new Promise((_, r) => (reject = r)));
    render(<MapView points={[]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    fireEvent.click(screen.getByRole("button", { name: "現在地へ" }));
    expect(await screen.findByRole("button", { name: "取得中…" })).toBeDisabled();
    reject(new Error("位置情報の利用が許可されていません"));
    expect(await screen.findByText("位置情報の利用が許可されていません")).toBeInTheDocument();
  });
  it("Error以外が投げられても既定の文言を表示する", async () => {
    locate.mockRejectedValue("x");
    render(<MapView points={[]} speciesLabel={label} withoutLocation={0} locate={locate} />);
    fireEvent.click(screen.getByRole("button", { name: "現在地へ" }));
    expect(await screen.findByText("現在地を取得できませんでした")).toBeInTheDocument();
  });

  describe("みんなの観察（#46）", () => {
    const sharedOf = (over = {}) => ({ points: [] as MapPoint[], message: "", loading: false, load: vi.fn(), ...over });
    it("共有の機能が無ければ、切り替えを出さない", () => {
      render(<MapView points={[]} speciesLabel={label} withoutLocation={0} locate={locate} />);
      expect(screen.queryByRole("button", { name: "みんなの観察" })).toBeNull();
    });
    it("切り替えを出し、初期は自分の記録。みんなの観察を選ぶと、表示範囲で取得を依頼する", () => {
      const shared = sharedOf();
      render(<MapView points={[pt()]} speciesLabel={label} withoutLocation={0} locate={locate} shared={shared} />);
      expect(screen.getByRole("button", { name: "自分の記録" })).toHaveAttribute("aria-pressed", "true");
      expect(shared.load).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "みんなの観察" }));
      expect(shared.load).toHaveBeenCalled();
      // jsdomでは地図の大きさが0のため、範囲の中身ではなく、4辺の数値が渡ることを確かめる
      const b = shared.load.mock.calls[0][0];
      expect(Object.keys(b).sort()).toEqual(["east", "north", "south", "west"]);
      expect(Object.values(b).every((v) => typeof v === "number" && Number.isFinite(v))).toBe(true);
    });
    it("みんなの観察を選ぶと、共有されたピンを出し、自分の記録のピンは隠す。戻すと逆になる", () => {
      const shared = sharedOf({ points: [pt({ key: "s1", speciesId: "bat", count: 4 })] });
      const { container } = render(<MapView points={[pt()]} speciesLabel={label} withoutLocation={0} locate={locate} shared={shared} />);
      expect(container.querySelectorAll(".bird-pin:not(.shared)")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "みんなの観察" }));
      expect(container.querySelectorAll(".bird-pin:not(.shared)")).toHaveLength(0);
      expect(container.querySelectorAll(".bird-pin.shared")).toHaveLength(1);
      expect(container.querySelector(".pin-count")).toHaveTextContent("4");
      fireEvent.click(screen.getByRole("button", { name: "自分の記録" }));
      expect(container.querySelectorAll(".bird-pin.shared")).toHaveLength(0);
      expect(container.querySelectorAll(".bird-pin:not(.shared)")).toHaveLength(1);
    });
    it("取得中・失敗・空の案内を出す。自分の記録に切り替えると出さない", () => {
      const { rerender } = render(<MapView points={[]} speciesLabel={label} withoutLocation={0} locate={locate} shared={sharedOf({ loading: true })} />);
      fireEvent.click(screen.getByRole("button", { name: "みんなの観察" }));
      expect(screen.getByRole("status")).toHaveTextContent("みんなの観察を取得しています");
      rerender(<MapView points={[]} speciesLabel={label} withoutLocation={0} locate={locate} shared={sharedOf({ message: "オフラインのため、みんなの観察を取得できません" })} />);
      expect(screen.getByRole("status")).toHaveTextContent("オフラインのため");
      fireEvent.click(screen.getByRole("button", { name: "自分の記録" }));
      expect(screen.getByRole("status")).toHaveTextContent("見つけた場所つきの記録がありません");
    });
  });
});
