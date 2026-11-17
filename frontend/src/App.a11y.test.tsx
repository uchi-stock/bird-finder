import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { chip, firstCard, openHelp, openMenu, renderApp, setupAppTests } from "./testApp";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);

setupAppTests();

describe("App: 注意文言のモーダル", () => {
  it("注意文言は画面に出さず、メニューから開くモーダルで見られ、閉じられる", async () => {
    await renderApp();
    expect(screen.queryByText(/点数順の目安/)).toBeNull();
    await openHelp();
    const dialog = screen.getByRole("dialog", { name: "使い方と注意" });
    expect(within(dialog).getByText(/確率ではありません/)).toBeInTheDocument();
    expect(within(dialog).getByText(/暫定値/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "使い方と注意" })).toBeNull();
  });
});

describe("App: アクセシビリティ", () => {
  it("条件のチップは、選択状態をaria-pressedで示す", async () => {
    await renderApp();
    const c = chip("どこで見たか", "地面の上");
    expect(c).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(c);
    expect(c).toHaveAttribute("aria-pressed", "true");
  });
  it("現在のタブがaria-currentで分かる", async () => {
    await renderApp();
    expect(screen.getByRole("button", { name: /探す/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /図鑑/ })).not.toHaveAttribute("aria-current");
  });
  it("使い方のモーダルは、開くと閉じるボタンへフォーカスし、Escで閉じてメニューのボタンへフォーカスが戻る", async () => {
    await renderApp();
    const open = screen.getByRole("button", { name: "メニュー" });
    open.focus();
    await openHelp();
    const dialog = screen.getByRole("dialog", { name: "使い方と注意" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "閉じる" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "使い方と注意" })).toBeNull();
    expect(open).toHaveFocus();
  });
  it("メニューは、dialogとして開き、バージョンと自宅の登録を持ち、Escで閉じる", async () => {
    await renderApp();
    await openMenu();
    const dialog = screen.getByRole("dialog", { name: "メニュー" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText(/更新:/)).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: /自宅の登録（共有から除外）/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "メニュー" })).toBeNull();
  });
  it("画面の切り替えは、名前つきのナビゲーションにある", async () => {
    await renderApp();
    const nav = screen.getByRole("navigation", { name: "画面の切り替え" });
    expect(within(nav).getAllByRole("button")).toHaveLength(3);
  });
  it("拡大表示は、dialogとして名前を持ち、閉じるボタンで閉じられる", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    const dialog = await screen.findByRole("dialog", { name: /の詳細$/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: /の詳細$/ })).toBeNull();
  });
  it("拡大表示は、Escキーで閉じられる", async () => {
    await renderApp();
    fireEvent.click(firstCard());
    await screen.findByRole("dialog", { name: /の詳細$/ });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /の詳細$/ })).toBeNull();
  });
});
