import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Battle } from "./Battle";

vi.mock("../photo", async () => (await import("../testApp")).photoMock);

const entry = { firstAt: "2026-11-01T00:00:00.000Z", count: 1 };

describe("Battle: ダミーの鳥との、勝ち負けの無い物語", () => {
  it("ダミーである旨と、勝ち負けが無い旨を、常に出す", () => {
    render(<Battle opponentId="grey_heron" collection={{ sparrow: entry }} onBack={() => {}} />);
    expect(screen.getByText(/相手は「ダミー」のアオサギです（実際の観察ではありません）。勝ち負けはありません/)).toBeInTheDocument();
  });

  it("鳥を捕まえていないときは、バトルできない旨を出す（はじめるは出ない）", () => {
    render(<Battle opponentId="grey_heron" collection={{}} onBack={() => {}} />);
    expect(screen.getByText(/まだ鳥を捕まえていません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "はじめる" })).toBeNull();
  });

  it("捕まえた鳥から選ぶと、はじめられ、場面を進めて、おわりまで見られる。選びなおせる", async () => {
    render(<Battle opponentId="grey_heron" collection={{ sparrow: entry }} onBack={() => {}} />);
    expect(screen.getByRole("button", { name: "はじめる" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "スズメ" }));
    await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
    expect(screen.getByRole("heading", { name: /1\/6 出会い/ })).toBeInTheDocument();
    for (const title of ["大きさ", "めずらしさ", "動き", "声"]) {
      await userEvent.click(screen.getByRole("button", { name: "つぎへ" }));
      expect(screen.getByRole("heading", { name: new RegExp(title) })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: "つぎへ" }));
    expect(screen.getByRole("status")).toHaveTextContent("勝ち負けなく");
    expect(screen.queryByRole("button", { name: "つぎへ" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "鳥を選びなおす" }));
    expect(screen.getByRole("button", { name: "はじめる" })).toBeInTheDocument();
  });

  it("相手の名前に「ダミー」を付けて出す。「地図へもどる」で、戻る", async () => {
    const onBack = vi.fn();
    render(<Battle opponentId="grey_heron" collection={{ sparrow: entry }} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: "スズメ" }));
    await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
    expect(screen.getByText("（ダミー）アオサギ")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "地図へもどる" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("相手の種IDが不明なら、見つからない旨を出して、戻れる", async () => {
    const onBack = vi.fn();
    render(<Battle opponentId="nobody" collection={{}} onBack={onBack} />);
    expect(screen.getByText("相手が見つかりませんでした。")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "もどる" }));
    expect(onBack).toHaveBeenCalled();
  });
});
