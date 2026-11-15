import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateNotifier } from "./UpdateNotifier";

function stubServiceWorker(controller: unknown) {
  const listeners: Record<string, () => void> = {};
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      controller,
      addEventListener: (t: string, f: () => void) => (listeners[t] = f),
      removeEventListener: vi.fn(),
    },
  });
  return listeners;
}

afterEach(() => {
  // アンマウント（navigator.serviceWorkerを参照する後始末）を先に済ませてから消す
  cleanup();
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});

describe("UpdateNotifier", () => {
  it("Service Worker未対応なら何も表示しない", () => {
    const { container } = render(<UpdateNotifier />);
    expect(container).toBeEmptyDOMElement();
  });
  it("既存バージョンからの切り替わりで再読み込みを促す", async () => {
    const l = stubServiceWorker({});
    render(<UpdateNotifier />);
    expect(screen.queryByRole("alert")).toBeNull();
    l.controllerchange();
    expect(await screen.findByRole("alert")).toHaveTextContent("新しいバージョンがあります");
  });
  it("初回インストール（制御下になかった）では表示しない", async () => {
    const l = stubServiceWorker(null);
    render(<UpdateNotifier />);
    l.controllerchange();
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("更新ボタンで再読み込みする", async () => {
    const l = stubServiceWorker({});
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    render(<UpdateNotifier />);
    l.controllerchange();
    fireEvent.click(await screen.findByRole("button", { name: "更新する" }));
    expect(reload).toHaveBeenCalled();
  });
});
