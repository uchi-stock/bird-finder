import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCallAudio, fetchPhoto, playAudio, renderApp, renderAppNoWait, setupAppTests, stopAudio, unlockAudio } from "./testApp";
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
  await userEvent.click(screen.getByRole("button", { name: /名前を見て、写真から選ぶ/ }));
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
    await userEvent.click(screen.getByRole("button", { name: /名前を見て、写真から選ぶ/ }));
    expect(await screen.findByText(/問題を作れませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /名前を見て、写真から選ぶ/ })).toBeInTheDocument();
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
    localStorage.setItem("bird-finder:quiz:v1", JSON.stringify({ best: 4, bestCall: 0, wrong: Object.fromEntries(wrong.map((s) => [s.species_id, 1])) }));
    await openQuiz();
    expect(screen.getByText(/最高: 名前 4問正解/)).toBeInTheDocument();
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

describe("App: クイズ（鳴き声を聞いて、写真から選ぶ）", () => {
  const startCall = async () => {
    await openQuiz();
    await userEvent.click(screen.getByRole("button", { name: /鳴き声を聞いて、写真から選ぶ/ }));
    await screen.findByRole("group", { name: "写真の選択肢" });
  };
  const playButton = () => screen.getByRole("button", { name: /鳴き声を聞く|もう一度聞く|止める|音源を探しています/ });

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("名前は出さず、問題が出たら自動で鳴き声が再生される。解錠はタップの中で、音源を探すより前に行う（#123）", async () => {
    await openQuiz();
    await userEvent.click(screen.getByRole("button", { name: /鳴き声を聞いて、写真から選ぶ/ }));
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    await screen.findByRole("group", { name: "写真の選択肢" });
    expect(unlockAudio.mock.invocationCallOrder[0]).toBeLessThan(fetchCallAudio.mock.invocationCallOrder[0]);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("この鳴き声の鳥は？");
    // ボタンを押さなくても、再生が始まる
    await waitFor(() => expect(playAudio).toHaveBeenCalledWith("https://u/a.mp3", expect.any(Function)));
    expect(playAudio).toHaveBeenCalledTimes(1);
    expect(unlockAudio.mock.invocationCallOrder[0]).toBeLessThan(playAudio.mock.invocationCallOrder[0]);
    // 再生中は「止める」になり、押すと停止する。終わると「もう一度聞く」になり、聞き直せる
    await userEvent.click(screen.getByRole("button", { name: /止める/ }));
    expect(stopAudio).toHaveBeenCalled();
    await waitFor(() => expect(playButton()).toBeEnabled());
    await userEvent.click(playButton());
    expect(playAudio).toHaveBeenCalledTimes(2);
  });

  it("再生が終わると、ボタンは「もう一度聞く」になる。次の問題でも、自動で再生される", async () => {
    await startCall();
    await waitFor(() => expect(playAudio).toHaveBeenCalledTimes(1));
    act(() => (playAudio.mock.calls[0][1] as () => void)()); // 再生の終了
    expect(await screen.findByRole("button", { name: /もう一度聞く/ })).toBeEnabled();
    await answerFirst();
    const unlocks = unlockAudio.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: nextLabel(0) }));
    expect(unlockAudio.mock.calls.length).toBeGreaterThan(unlocks); // 「次へ」のタップで解錠する
    await waitFor(() => expect(playAudio).toHaveBeenCalledTimes(2));
  });

  it("音源が見つからない鳥は飛ばして別の問題にし、10問遊べる。回答後に音源の出典が出る", async () => {
    // 最初の問題の音源だけ見つからない（確実に飛ばされる）。以降は、すべて見つかる
    fetchCallAudio.mockReset().mockResolvedValue({ src: "https://u/a.mp3", pageUrl: "https://c/File:a", title: "a.ogg", credit: "録音者A", license: "CC BY 4.0" });
    fetchCallAudio.mockResolvedValueOnce(null);
    await startCall();
    let skipped = false;
    for (let i = 0; i < 10; i++) {
      await waitFor(() => expect(playButton()).toBeEnabled());
      skipped ||= screen.queryByText(/音源が見つからなかったので/) !== null;
      await answerFirst();
      if (i === 0) expect(screen.getByText(/音源: Wikimedia Commons（録音: 録音者A ／ CC BY 4\.0）/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: nextLabel(i) }));
    }
    expect(screen.getByText(/\/ 10 問正解/)).toBeInTheDocument();
    // 音源が見つからなかった問題は、実際に飛ばされている
    expect(skipped).toBe(true);
  });

  it("すべての音源が見つからなければ、止まらずに案内を出す", async () => {
    fetchCallAudio.mockResolvedValue(null);
    await openQuiz();
    await userEvent.click(screen.getByRole("button", { name: /鳴き声を聞いて、写真から選ぶ/ }));
    expect(await screen.findByText(/問題を作れませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /鳴き声を聞いて、写真から選ぶ/ })).toBeInTheDocument();
  });

  it("音源の取得が失敗しても、止まらずに次の問題へ進む", async () => {
    fetchCallAudio.mockRejectedValueOnce(new Error("net")).mockResolvedValue({ src: "https://u/a.mp3", pageUrl: "https://c/File:a", title: "a.ogg" });
    await startCall();
    await waitFor(() => expect(playButton()).toBeEnabled());
    expect(screen.getByRole("group", { name: "写真の選択肢" })).toBeInTheDocument();
  });

  it("自動再生できなかったら、案内を出してボタン再生へ戻す（音量・マナーモード）", async () => {
    playAudio.mockRejectedValueOnce(new Error("NotAllowedError"));
    await startCall();
    expect(await screen.findByText(/自動で再生できませんでした/)).toBeInTheDocument();
    await waitFor(() => expect(playButton()).toBeEnabled());
    expect(playButton()).toHaveTextContent("鳴き声を聞く");
    await userEvent.click(playButton()); // ボタンなら、再生できる
    expect(playAudio).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/自動で再生できませんでした/)).toBeNull();
  });

  it("オフラインでは、鳴き声のクイズを選べず、理由を出す", async () => {
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      // オフラインでは環境の判定をしないため、判定を待たずに開く
      await renderAppNoWait();
      await userEvent.click(screen.getByRole("button", { name: /クイズ/ }));
      expect(screen.getByRole("button", { name: /鳴き声を聞いて、写真から選ぶ/ })).toBeDisabled();
      expect(screen.getByText(/オフラインでは使えません/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /名前を見て、写真から選ぶ/ })).toBeEnabled();
    } finally {
      onLine.mockRestore();
    }
  });

  it("鳴き声のクイズの成績は、名前のクイズとは別に保存される", async () => {
    await startCall();
    for (let i = 0; i < 10; i++) {
      await waitFor(() => expect(playButton()).toBeEnabled());
      await answerFirst();
      await userEvent.click(screen.getByRole("button", { name: nextLabel(i) }));
    }
    const stored = JSON.parse(localStorage.getItem("bird-finder:quiz:v1") ?? "{}");
    expect(stored.best).toBe(0);
    expect(typeof stored.bestCall).toBe("number");
  });
});

describe("App: クイズ（状況を読んで、写真から選ぶ）（#128）", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  const startSituation = async () => {
    await openQuiz();
    await userEvent.click(screen.getByRole("button", { name: /状況を読んで、写真から選ぶ/ }));
    await screen.findByRole("group", { name: "写真の選択肢" });
  };
  it("名前は出さず、手がかり3つと4枚の写真が出る。回答後に決め手と正解が出る。音は使わない", async () => {
    await startSituation();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("この状況にあてはまる鳥は？");
    expect(document.querySelectorAll(".quiz-clues li")).toHaveLength(3);
    expect(choices()).toHaveLength(4);
    expect(playAudio).not.toHaveBeenCalled();
    await answerFirst();
    expect(screen.getByText(/決め手:/)).toBeInTheDocument();
    expect(screen.getByText(/すべてにあてはまります/)).toBeInTheDocument();
  });
  it("1ラウンド（10問）遊べて、状況の成績が保存される", async () => {
    await startSituation();
    for (let i = 0; i < 10; i++) {
      await answerFirst();
      await userEvent.click(screen.getByRole("button", { name: nextLabel(i) }));
    }
    expect(screen.getByText(/\/ 10 問正解/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("bird-finder:quiz:v1") ?? "{}")).toHaveProperty("bestSituation");
  });
});
