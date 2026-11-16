import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { usePhoto, usePhotoFailed, retryPhoto, fetchCallAudio, useFlightPhoto, chip, firstCard, renderApp, setupAppTests } from "./testApp";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);

setupAppTests();

describe("App: 写真", () => {
  it("写真が無ければ「写真なし」を表示する", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    expect(screen.getAllByText("写真なし").length).toBeGreaterThan(0);
  });
  it("写真をタップすると拡大し、読み込み失敗時は元の写真に戻る。タップで閉じる", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    await userEvent.click(screen.getAllByRole("button", { name: /写真を拡大/ })[0]);
    const big = document.querySelector(".lightbox .lb-large") as HTMLImageElement;
    expect(big.src).toContain("/500px-a.jpg");
    fireEvent.error(big);
    expect((document.querySelector(".lightbox .lb-large") as HTMLImageElement).src).toContain("/330px-a.jpg");
    expect(screen.getByRole("link", { name: /出典: Wikipedia/ })).toHaveAttribute("href", "https://w/x");
    await userEvent.click(document.querySelector(".lightbox") as HTMLElement);
    expect(document.querySelector(".lightbox")).toBeNull();
  });
});

describe("App: 拡大表示で、先に画像を出す", () => {
  const photo = { thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" };
  it("音源を探している間も、開いた瞬間に読み込み済みの小さい版が拡大して出る", async () => {
    usePhoto.mockReturnValue(photo);
    fetchCallAudio.mockReturnValue(new Promise(() => {})); // 音源の検索が終わらない
    await renderApp();
    fireEvent.click(firstCard());
    const box = document.querySelector(".lightbox") as HTMLElement;
    expect(box).not.toBeNull();
    expect((box.querySelector(".lb-thumb") as HTMLImageElement).src).toContain("/330px-a.jpg");
    expect(within(box).getAllByText(/音源を探しています/).length).toBeGreaterThan(0);
  });
  it("大きい版が読み込めるまでは重ねず、読み込めたら表示を切り替える", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    const large = document.querySelector(".lightbox .lb-large") as HTMLImageElement;
    expect(large).not.toHaveClass("on");
    fireEvent.load(large);
    expect(document.querySelector(".lightbox .lb-large")).toHaveClass("on");
  });
  it("大きい版が失敗しても、小さい版が出たまま（失敗した大きい版は重ならない）", async () => {
    usePhoto.mockReturnValue(photo);
    await renderApp();
    fireEvent.click(firstCard());
    fireEvent.error(document.querySelector(".lightbox .lb-large") as HTMLElement);
    expect(document.querySelector(".lightbox .lb-thumb")).not.toBeNull();
    expect(document.querySelector(".lightbox .lb-large")).not.toHaveClass("on");
  });
  it("飛翔の写真は、大きい版が無いため、同じ画像を使う", async () => {
    useFlightPhoto.mockReturnValue({ thumbnail: "https://c/500px-fly.jpg", pageUrl: "https://c/x", flight: true });
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    fireEvent.click(firstCard());
    expect((document.querySelector(".lightbox .lb-large") as HTMLImageElement).src).toContain("/500px-fly.jpg");
    expect((document.querySelector(".lightbox .lb-thumb") as HTMLImageElement).src).toContain("/500px-fly.jpg");
  });
});

describe("App: 状況に応じた姿の画像", () => {
  const standing = { thumbnail: "https://u/330px-stand.jpg", pageUrl: "https://w/stand" };
  const flightPhoto = { thumbnail: "https://c/500px-fly.jpg", pageUrl: "https://c/File:Fly.jpg", credit: "撮影者A", license: "CC BY 4.0", flight: true };
  it("止まっている状況では通常の画像を使い、飛翔画像は取得しない", async () => {
    usePhoto.mockReturnValue(standing);
    useFlightPhoto.mockReturnValue(flightPhoto);
    await renderApp();
    await userEvent.click(chip("行動", "止まる"));
    expect(screen.queryByText("飛翔")).toBeNull();
    expect(useFlightPhoto).toHaveBeenLastCalledWith(expect.any(String), false);
    expect(document.querySelector(".results .photo img")).toHaveAttribute("src", standing.thumbnail);
  });
  it("飛んでいる状況（行動:飛ぶ）では飛翔の画像と「飛翔」の印を表示し、出典に撮影者とライセンスを出す", async () => {
    usePhoto.mockReturnValue(standing);
    useFlightPhoto.mockReturnValue(flightPhoto);
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    expect(useFlightPhoto).toHaveBeenLastCalledWith(expect.any(String), true);
    expect(screen.getAllByText("飛翔").length).toBeGreaterThan(0);
    expect(document.querySelector(".results .photo img")).toHaveAttribute("src", flightPhoto.thumbnail);
    await userEvent.click(screen.getAllByRole("button", { name: /写真を拡大/ })[0]);
    expect(screen.getByRole("link", { name: /撮影: 撮影者A ／ CC BY 4.0/ })).toHaveAttribute("href", flightPhoto.pageUrl);
  });
  it("場所が空なら、飛翔画像が見つからないときは通常の画像に戻す", async () => {
    usePhoto.mockReturnValue(standing);
    useFlightPhoto.mockReturnValue(null);
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    expect(document.querySelector(".results .photo img")).toHaveAttribute("src", standing.thumbnail);
    expect(screen.queryByText("飛翔")).toBeNull();
  });
  it("飛翔画像の拡大では、出典の撮影者が無ければ「不明」と表示する", async () => {
    useFlightPhoto.mockReturnValue({ thumbnail: "https://c/500px-fly.jpg", pageUrl: "https://c/x", flight: true });
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    await userEvent.click(screen.getAllByRole("button", { name: /写真を拡大/ })[0]);
    expect(screen.getByRole("link", { name: /撮影: 不明/ })).toBeInTheDocument();
  });
});

describe("App: 外部サービスの失敗時の案内（#75）", () => {
  it("写真の取得が一時的に失敗したときは「再読み込み」を出し、押すと取り直す", async () => {
    usePhotoFailed.mockReturnValue(true);
    await renderApp();
    const btn = (await screen.findAllByRole("button", { name: "再読み込み" }))[0];
    await userEvent.click(btn);
    expect(retryPhoto).toHaveBeenCalled();
  });
  it("端末へ保存できないときは、図鑑タブに案内を出す。保存できるときは出さない", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /図鑑/ }));
    expect(screen.queryByText(/図鑑を保存できません/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /探す/ }));
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    await userEvent.click(screen.getByRole("button", { name: /図鑑/ }));
    expect(screen.getByText(/図鑑を保存できません/)).toBeInTheDocument();
    spy.mockRestore();
  });
  it("もともと写真が無い（失敗ではない）ときは、再読み込みを出さない", async () => {
    await renderApp();
    expect(screen.queryByRole("button", { name: "再読み込み" })).toBeNull();
  });
});
