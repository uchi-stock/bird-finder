import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { detectHabitats, usePhoto, section, labelOf, chips, chip, firstCard, renderApp, setupAppTests, openHelp, openMenu } from "./testApp";

vi.mock("./callAudio", async () => (await import("./testApp")).callAudioMock);
vi.mock("./location", async () => (await import("./testApp")).locationMock);
vi.mock("./photo", async () => (await import("./testApp")).photoMock);

setupAppTests();

describe("App: 基本表示", () => {
  it("タイトルを表示し、バージョン・更新日時はメニューの中にある", async () => {
    await renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("声しか知らない鳥を探す");
    expect(screen.queryByText(/v0\.0\.0-test/)).toBeNull();
    await openMenu();
    expect(screen.getByText(/v0\.0\.0-test/)).toBeInTheDocument();
  });
  it("開いた直後は、現在の時間帯（朝）に合う鳥を最大4件出す", async () => {
    await renderApp();
    expect(within(screen.getByRole("list")).getAllByRole("listitem").length).toBeLessThanOrEqual(4);
    expect(chip("時間帯", "朝")).toHaveClass("on");
  });
  it("入力を全て外すと案内を出し、候補は出さない", async () => {
    await renderApp();
    await userEvent.click(chip("時間帯", "朝"));
    expect(screen.getByText(/1つ以上入力すると/)).toBeInTheDocument();
  });
  it("入力の順序は 環境 → 場所 → 行動", async () => {
    await renderApp();
    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(order.indexOf("周辺の環境（複数可）")).toBeLessThan(order.indexOf("どこで見たか"));
    expect(order.indexOf("どこで見たか")).toBeLessThan(order.indexOf("行動（複数可）"));
  });
});

describe("App: 候補の表示", () => {
  it("大きさを選ぶと最大4件の候補を出し、検索結果は画像と近さの段階だけを表示する（詳細・理由は出さない）", async () => {
    await renderApp();
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "2" }));
    const items = within(screen.getByRole("list")).queryAllByRole("listitem");
    expect(items.length).toBeLessThanOrEqual(4);
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.querySelector(".badge")).toHaveTextContent(/かなり近い|近い|候補のひとつ/);
      expect(within(li).queryByText(/一致:/)).toBeNull();
      expect(within(li).queryByText(/鳴き声:/)).toBeNull();
      expect(li.textContent).not.toMatch(/%|％/); // 確率（パーセント）としては表示しない
    }
    expect(screen.queryByText(/確率ではありません/)).toBeNull(); // 注意文言は「ⓘ」のモーダルへ移した
  });
  it("写真がある鳥は画像だけ（名前は出さない）。写真が無い鳥は、枠に名前を出して見分けられるようにする", async () => {
    usePhoto.mockReturnValue({ thumbnail: "https://u/330px-a.jpg", pageUrl: "https://w/x" });
    await renderApp();
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "2" }));
    const withPhoto = within(screen.getByRole("list")).getAllByRole("listitem")[0];
    expect(withPhoto.querySelector(".photo img")).not.toBeNull();
    expect(withPhoto.querySelector(".empty-name")).toBeNull();
    usePhoto.mockReturnValue(null);
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "3" })); // 再描画
    const noPhoto = within(screen.getByRole("list")).getAllByRole("listitem")[0];
    expect(noPhoto.querySelector(".empty-name")).toHaveTextContent(/.+/);
  });
  it("詳細は拡大表示に出る: 名前・近さ・説明・鳴き声・一致／不一致／未入力の理由", async () => {
    await renderApp();
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "2" }));
    fireEvent.click(firstCard());
    const box = document.querySelector(".lightbox") as HTMLElement;
    expect(box.querySelector(".lightbox-name")).toHaveTextContent(/.+/);
    expect(box.querySelector(".badge")).toHaveTextContent(/かなり近い|近い|候補のひとつ/);
    expect(within(box).getAllByText(/鳴き声:/).length).toBeGreaterThan(0);
    expect(within(box).getByText(/一致:/)).toBeInTheDocument();
    expect(within(box).getByText(/未入力:/)).toBeInTheDocument();
  });
  it("鳴き声が一致する鳥が無ければ、無理に出さず案内する", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ゾゾゾゾ");
    expect(screen.getByText(/近い鳥が見つかりませんでした/)).toBeInTheDocument();
  });
  it("オノマトペで鳥が出る（ホーホケキョ → ウグイス）", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    expect(screen.getByText("ウグイス")).toBeInTheDocument();
  });
  it("入力をクリアすると候補が消える", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "ホーホケキョ");
    await userEvent.click(screen.getByRole("button", { name: "入力をクリア" }));
    expect(screen.queryByText("ウグイス")).toBeNull();
  });
});

describe("App: 前の回答で後続の選択肢を絞る", () => {
  it("住宅街を選ぶと、場所に水辺・草むらが出ない", async () => {
    await renderApp();
    await userEvent.click(chip("周辺の環境", "住宅街"));
    const places = chips("どこで見たか").join(",");
    expect(places).not.toMatch(/水辺・水面/);
    expect(places).not.toMatch(/草むら/);
    expect(places).toMatch(/建物や屋根/);
  });
  it("空を選ぶと飛ぶが自動で選ばれ、選択肢は飛ぶ・鳴くのみ", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    expect(chips("行動")).toEqual(["飛ぶ・滑空する", "鳴く・歌う"]);
    expect(chip("行動", "飛ぶ")).toHaveClass("on");
  });
  it("空から地面へ変えると、自動で入った飛ぶが外れる", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    await userEvent.click(chip("どこで見たか", "地面の上"));
    expect(chips("行動")).not.toContain("飛ぶ・滑空する");
  });
  it("環境を変えて選べなくなった場所は自動で解除される", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "水辺・水面"));
    await userEvent.click(chip("周辺の環境", "住宅街"));
    await waitFor(() => expect(chip("どこで見たか", "地面の上")).not.toHaveClass("on"));
    expect(chips("どこで見たか").join(",")).not.toMatch(/水辺・水面/);
  });
  it("時間帯は現在時刻から自動で選ばれ、もう一度押すと解除できる", async () => {
    await renderApp();
    const on = within(section("時間帯")).getAllByRole("button").filter((b) => b.classList.contains("on"));
    expect(on).toHaveLength(1);
    await userEvent.click(on[0]);
    expect(within(section("時間帯")).queryAllByRole("button").filter((b) => b.classList.contains("on"))).toHaveLength(0);
  });
});

describe("App: 鳴き声が聞こえなかった", () => {
  it("選ぶとオノマトペ欄が無効になり、入力済みの文字は消える。聞こえない種が出る", async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText(/ホーホケキョ/), "チチチ");
    await userEvent.click(screen.getByRole("button", { name: "鳴き声は聞こえなかった" }));
    const input = screen.getByPlaceholderText(/ホーホケキョ/);
    expect(input).toBeDisabled();
    expect(input).toHaveValue("");
    fireEvent.click(firstCard()); // 理由は拡大表示（詳細）に出る
    expect(within(document.querySelector(".lightbox") as HTMLElement).getAllByText(/鳴き声（聞こえない）/).length).toBeGreaterThan(0);
  });
  it("もう一度押すと解除できる", async () => {
    await renderApp();
    const btn = screen.getByRole("button", { name: "鳴き声は聞こえなかった" });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.getByPlaceholderText(/ホーホケキョ/)).toBeEnabled();
  });
  it("夕方に空を飛ぶ小さな影で、鳴き声が聞こえなければコウモリが出る", async () => {
    vi.setSystemTime(new Date(2026, 5, 15, 18, 0, 0));
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    await userEvent.click(within(section("大きさ")).getByRole("button", { name: "1" }));
    await userEvent.click(screen.getByRole("button", { name: "鳴き声は聞こえなかった" }));
    expect(screen.getByText("アブラコウモリ")).toBeInTheDocument();
    fireEvent.click(screen.getByText("アブラコウモリ").closest("li") as HTMLElement); // 説明は拡大表示（詳細）に出る
    expect(within(document.querySelector(".lightbox") as HTMLElement).getByText(/鳥ではなくコウモリ/)).toBeInTheDocument();
  });
});

describe("App: 行動の選択肢と絵文字", () => {
  it("行動は6つ（飛ぶは空のときだけ）: 泳ぐ／水の中に立つ・歩く／止まる・立つ・歩く／鳴く／採食／羽繕い", async () => {
    await renderApp();
    expect(chips("行動")).toEqual(["泳ぐ", "水の中に立つ・歩く", "止まる・立つ・歩く", "鳴く・歌う", "採食する・つつく", "羽繕いする"]);
  });
  it("見えない（声だけ）を選ぶと、鳴くが自動で選ばれる", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "見えない（声だけ）"));
    expect(chips("行動")).toEqual(["鳴く・歌う"]);
    expect(chip("行動", "鳴く")).toHaveClass("on");
  });
  it("地面の上では、泳ぐ・水の中に立つ・歩くを出さない", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "地面の上"));
    const behaviors = chips("行動");
    expect(behaviors).not.toContain("泳ぐ");
    expect(behaviors).not.toContain("水の中に立つ・歩く");
    expect(behaviors).toContain("止まる・立つ・歩く");
  });
  it("水辺・水面では、泳ぐと水の中に立つ・歩くを選べる", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "水辺・水面"));
    expect(chips("行動")).toEqual(expect.arrayContaining(["泳ぐ", "水の中に立つ・歩く"]));
  });
  it("絵文字は読み上げ対象外（aria-hidden）で、各ボタンに付いている", async () => {
    await renderApp();
    for (const title of ["周辺の環境", "どこで見たか", "行動", "鳴き声", "大きさ", "時間帯"]) {
      for (const b of within(section(title)).getAllByRole("button")) {
        expect(b.querySelector('.emoji[aria-hidden="true"]'), `${title}: ${labelOf(b)}`).not.toBeNull();
      }
    }
    expect(screen.getByRole("button", { name: "探す" }).querySelector(".emoji")).not.toBeNull();
    expect(screen.getByRole("button", { name: /図鑑 0\/44/ }).querySelector(".emoji")).not.toBeNull();
    expect(screen.getByRole("button", { name: /現在地から判定する/ }).querySelector(".emoji")).not.toBeNull();
  });
});

describe("App: 現在地から周辺環境", () => {
  it("起動時に現在地から環境を判定して初期値にする", async () => {
    detectHabitats.mockResolvedValue(["waterside"]);
    await renderApp();
    expect(chip("周辺の環境", "川辺")).toHaveClass("on");
    // 判定できたときの案内は画面に出さない（ⓘのモーダルに載せた）
    expect(screen.queryByText(/違う場合はタップで修正/)).toBeNull();
  });
  it("判定できなければ手動選択を促す", async () => {
    detectHabitats.mockResolvedValue([]);
    await renderApp();
    expect(screen.getByText(/判定できませんでした/)).toBeInTheDocument();
  });
  it("失敗時は原因を表示し、ボタンで再試行できる", async () => {
    detectHabitats.mockRejectedValueOnce(new Error("位置情報の利用が許可されていません"));
    await renderApp();
    expect(screen.getByText("位置情報の利用が許可されていません")).toBeInTheDocument();
    detectHabitats.mockResolvedValue(["urban"]);
    await userEvent.click(screen.getByRole("button", { name: /現在地から判定する/ }));
    await waitFor(() => expect(chip("周辺の環境", "住宅街")).toHaveClass("on"));
  });
  it("Error以外が投げられても既定の文言を表示する", async () => {
    detectHabitats.mockRejectedValueOnce("x");
    await renderApp();
    expect(screen.getByText("現在地を取得できませんでした")).toBeInTheDocument();
  });
});

describe("App: 見えない（声だけ）のとき、大きさ・羽の色は回答不要（#88・#99）", () => {
  const dots = () => screen.getAllByRole("button", { name: /^\d\. / }).map((b) => b.getAttribute("aria-label"));
  it("選ぶと、大きさ・羽の色のカードを出さず（5枚になる）、入力済みの値は消える。別の場所へ変えると戻る", async () => {
    await renderApp();
    await userEvent.click(chip("大きさ", "2"));
    await userEvent.click(chip("羽の色", "茶"));
    expect(chip("大きさ", "2")).toHaveAttribute("aria-pressed", "true");
    expect(dots()).toHaveLength(7);
    await userEvent.click(chip("どこで見たか", "見えない（声だけ）"));
    expect(dots()).toEqual(["1. 周辺の環境", "2. どこで見たか", "3. 行動", "4. 鳴き声", "5. 時間帯"]);
    expect(screen.queryByRole("heading", { name: /^大きさ/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^羽の色/ })).toBeNull();
    expect(screen.queryByText(/不明として扱います/)).toBeNull(); // 案内も不要（カード自体が無い）
    await userEvent.click(chip("どこで見たか", "見えない（声だけ）")); // もう一度押して解除
    expect(dots()).toHaveLength(7);
    expect(chip("大きさ", "2")).toHaveAttribute("aria-pressed", "false");
    expect(chip("羽の色", "茶")).toHaveAttribute("aria-pressed", "false");
  });
  it("見えない（声だけ）を選ぶと、大きさ・羽の色のカードが減り、枚数が合う", async () => {
    await renderApp();
    await userEvent.click(chip("どこで見たか", "見えない（声だけ）"));
    expect(dots()).toEqual(["1. 周辺の環境", "2. どこで見たか", "3. 行動", "4. 鳴き声", "5. 時間帯"]);
  });
  it("現在位置の表示は、カードの枚数を超えない", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "7. 時間帯" })); // 7枚目へ
    await userEvent.click(screen.getByRole("button", { name: "2. どこで見たか" }));
    await userEvent.click(chip("どこで見たか", "見えない（声だけ）"));
    expect(screen.getByText(/\d\/5 /)).toBeInTheDocument();
  });
});

describe("App: 補足の案内はモーダルにまとめる", () => {
  it("環境の判定結果・場所の絞り込み・自動選択の案内は画面に出さず、ⓘのモーダルにある", async () => {
    detectHabitats.mockResolvedValue(["waterside"]);
    await renderApp();
    await userEvent.click(chip("どこで見たか", "空"));
    expect(screen.queryByText(/選んだ環境にある場所だけ/)).toBeNull();
    expect(screen.queryByText(/自動で選んでいます/)).toBeNull();
    await openHelp();
    const dialog = screen.getByRole("dialog", { name: "使い方と注意" });
    expect(within(dialog).getByText(/違う場合はタップで修正できます/)).toBeInTheDocument();
    expect(within(dialog).getByText(/その環境にある場所だけ/)).toBeInTheDocument();
    expect(within(dialog).getByText(/自動で選ばれます/)).toBeInTheDocument();
  });
});

describe("App: 検索は常に今をもとにする（#100）", () => {
  it("「季節を判定に使う」のチェックと観察日の入力は無い", async () => {
    await renderApp();
    expect(screen.queryByLabelText(/季節を判定に使う/)).toBeNull();
    expect(screen.queryByText("観察日")).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "時間帯" })).toBeInTheDocument();
  });
});

describe("App: 入口の切替ボタンは出さない（#125）", () => {
  it("「鳴き声から／姿から／両方」のボタンが無く、常に7枚のカードが出る", async () => {
    await renderApp();
    expect(screen.queryByRole("group", { name: "何をもとに探すか" })).toBeNull();
    expect(screen.queryByRole("button", { name: /鳴き声から|姿から/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^\d\. / })).toHaveLength(7);
    expect(screen.getByRole("heading", { name: /鳴き声（オノマトペ）/ })).toBeInTheDocument();
  });
  it("オノマトペで探せる", async () => {
    await renderApp();
    fireEvent.change(screen.getByPlaceholderText(/ホーホケキョ/), { target: { value: "ホーホケキョ" } });
    expect(await screen.findByText("ウグイス")).toBeInTheDocument();
  });
});

describe("App: 条件の横スライド", () => {
  it("条件が7枚のカードに分かれ、現在位置と回答済みが分かる", async () => {
    await renderApp();
    const dots = screen.getAllByRole("button", { name: /^\d\. / });
    expect(dots).toHaveLength(7);
    expect(dots[0]).toHaveClass("cur");
    expect(dots[6]).toHaveClass("done"); // 時間帯は現在時刻で回答済み
    await userEvent.click(chip("大きさ", "2"));
    expect(screen.getByRole("button", { name: "5. 大きさ" })).toHaveClass("done");
  });
  it("点をタップするとそのカードへ移動し、現在位置の表示が変わる", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "3. 行動" }));
    expect(screen.getByRole("button", { name: "3. 行動" })).toHaveClass("cur");
    expect(screen.getByText(/3\/7 行動/)).toBeInTheDocument();
  });
  it("スライドしたら、スクロール位置に応じて現在位置が変わる", async () => {
    await renderApp();
    const steps = document.querySelector(".steps") as HTMLElement;
    Object.defineProperty(steps, "scrollWidth", { configurable: true, value: 700 });
    Object.defineProperty(steps, "scrollLeft", { configurable: true, value: 200 });
    fireEvent.scroll(steps);
    expect(screen.getByRole("button", { name: "3. 行動" })).toHaveClass("cur");
  });
  it("幅が取れない環境ではスクロールしても現在位置を変えない", async () => {
    await renderApp();
    fireEvent.scroll(document.querySelector(".steps") as HTMLElement);
    expect(screen.getByRole("button", { name: "1. 周辺の環境" })).toHaveClass("cur");
  });
});
