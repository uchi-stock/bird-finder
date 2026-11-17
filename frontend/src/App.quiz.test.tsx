import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPhoto, renderApp, setupAppTests } from "./testApp";
import { SPECIES } from "./options";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);

setupAppTests();

const openQuiz = async () => {
  await renderApp();
  await userEvent.click(screen.getByRole("button", { name: /クイズ/ }));
};
const start = async () => {
  await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
  await screen.findByRole("group", { name: "写真の選択肢" });
};
const choices = () => within(screen.getByRole("group", { name: "写真の選択肢" })).getAllByRole("button");
const shownName = () => screen.getByRole("heading", { level: 2 }).textContent ?? "";

// 先頭の選択肢を選び、正解だったかを、回答後のラベル（「（正解）」）で知る
async function answerFirst() {
  await userEvent.click(choices()[0]);
  return choices()[0].getAttribute("aria-label")?.includes("（正解）") ?? false;
}
const nextLabel = (i: number) => (i < 9 ? "次へ" : "結果を見る");

describe("App: クイズ", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("タブバーからクイズを開き、はじめるを押すと、名前と4枚の写真の選択肢が出る", async () => {
    await openQuiz();
    expect(screen.getByRole("button", { name: /クイズ/ })).toHaveAttribute("aria-current", "page");
    await start();
    expect(SPECIES.map((s) => s.name_ja)).toContain(shownName());
    expect(choices()).toHaveLength(4);
  });

  it("選択肢のラベルに鳥の名前を入れない（読み上げで答えが漏れない）", async () => {
    await openQuiz();
    await start();
    const name = shownName();
    for (const b of choices()) {
      expect(b.getAttribute("aria-label")).toMatch(/^選択肢\d$/);
      expect(b.getAttribute("aria-label")).not.toContain(name);
    }
  });

  it("回答すると、正解・不正解を文字でも示し、正解の鳥の詳細が出る。次へで進む", async () => {
    await openQuiz();
    await start();
    await answerFirst();
    const feedback = screen.getByRole("status");
    expect(feedback.textContent).toMatch(/正解！|ざんねん/);
    expect(choices().some((b) => b.getAttribute("aria-label")?.includes("（正解）"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByText(/2 \/ 10 問/)).toBeInTheDocument();
  });

  it("10問終わると結果が出て、正答数が保存される。もう一度で最初から遊べる", async () => {
    await openQuiz();
    await start();
    for (let i = 0; i < 10; i++) {
      await answerFirst();
      await userEvent.click(screen.getByRole("button", { name: nextLabel(i) }));
    }
    expect(screen.getByRole("heading", { name: "結果" })).toBeInTheDocument();
    expect(screen.getByText(/\/ 10 問正解/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("bird-finder:quiz:v1") ?? "null")).toMatchObject({ best: expect.any(Number) });
    await userEvent.click(screen.getByRole("button", { name: "もう一度" }));
    await screen.findByRole("group", { name: "写真の選択肢" });
    expect(screen.getByText(/1 \/ 10 問/)).toBeInTheDocument();
  });

  it("写真を取得できない鳥は、正解にも選択肢にも出さない", async () => {
    const failing = new Set(SPECIES.slice(0, 30).map((s) => s.name_ja));
    fetchPhoto.mockImplementation(async (n: string) => (failing.has(n) ? null : { thumbnail: "https://upload.wikimedia.org/x/a.jpg", pageUrl: "https://x" }));
    await openQuiz();
    await start();
    expect(failing.has(shownName())).toBe(false);
  });

  it("写真が1枚も取得できないと、案内を出し、もう一度できる", async () => {
    fetchPhoto.mockResolvedValue(null);
    await openQuiz();
    await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
    expect(await screen.findByText(/写真を取得できませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "はじめる" })).toBeInTheDocument();
  });

  it("保存できない環境でも、クイズは動く", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    await openQuiz();
    await start();
    for (let i = 0; i < 10; i++) {
      await answerFirst();
      await userEvent.click(screen.getByRole("button", { name: nextLabel(i) }));
    }
    expect(screen.getByRole("heading", { name: "結果" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("間違えた鳥は成績に記録され、正解した鳥は記録から消える", async () => {
    await openQuiz();
    await start();
    const wrongNames: string[] = [];
    for (let i = 0; i < 10; i++) {
      const name = shownName();
      if (!(await answerFirst())) wrongNames.push(name);
      await userEvent.click(screen.getByRole("button", { name: nextLabel(i) }));
    }
    const stored = JSON.parse(localStorage.getItem("bird-finder:quiz:v1") ?? "{}");
    const ids = wrongNames.map((n) => SPECIES.find((s) => s.name_ja === n)!.species_id).sort();
    expect(Object.keys(stored.wrong).sort()).toEqual(ids);
  });

  it("復習では、間違えた鳥が最初の問題に出る", async () => {
    const wrong = SPECIES.slice(0, 3);
    localStorage.setItem("bird-finder:quiz:v1", JSON.stringify({ best: 4, wrong: Object.fromEntries(wrong.map((s) => [s.species_id, 1])) }));
    await openQuiz();
    expect(screen.getByText("最高: 4問正解")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "間違えた鳥を復習（3種）" }));
    await screen.findByRole("group", { name: "写真の選択肢" });
    const firstThree: string[] = [];
    for (let i = 0; i < 3; i++) {
      firstThree.push(shownName());
      await answerFirst();
      await userEvent.click(screen.getByRole("button", { name: "次へ" }));
    }
    expect(firstThree.sort()).toEqual(wrong.map((s) => s.name_ja).sort());
  });
});
