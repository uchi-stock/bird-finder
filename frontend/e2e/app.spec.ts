import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./screenshot.js";
import { openApp, showResults } from "./helpers";

const SIZES = [
  { name: "iphone14", width: 390, height: 844 },
  { name: "iphoneSE", width: 375, height: 667 },
];

for (const size of SIZES) {
  test.describe(`スマホ幅 ${size.name}（${size.width}x${size.height}）`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("初期表示: 横スクロールが出ず、タイトルがタブと重ならない", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      const h1 = await page.locator("h1").boundingBox();
      const tabs = await page.locator(".tabs").boundingBox();
      expect(h1 && tabs && h1.x + h1.width <= tabs.x + 1).toBe(true);
      await captureScreenshot(page, testInfo, `${size.name}-1-initial`, `初期表示（${size.name}）`, { fullPage: false });
      expect(errors).toEqual([]);
    });

    test("条件を入力すると候補が出て、結果は1画面に収まる。カードを横にスライドできる", async ({ page }, testInfo) => {
      await openApp(page);
      await showResults(page);
      const fit = await page.evaluate(() => {
        const ra = document.querySelector(".results-area") as HTMLElement;
        return ra.scrollHeight <= ra.clientHeight + 1;
      });
      expect(fit).toBe(true);
      expect(await page.locator(".results li").count()).toBeGreaterThan(0);
      await captureScreenshot(page, testInfo, `${size.name}-2-results`, `候補の表示（${size.name}）`, { fullPage: false });
      await page.click("button[aria-label='7. 時間帯']");
      await expect(page.locator(".step-title")).toContainText("7/7");
    });

    test("候補をタップすると拡大表示が開き、小さい画像がすぐ出る。捕まえるが中にある。Escで閉じる", async ({ page }, testInfo) => {
      await openApp(page);
      await showResults(page);
      await page.tap(".results li .tile");
      const dialog = page.getByRole("dialog", { name: /の詳細$/ });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".lb-thumb")).toBeVisible();
      await expect(dialog.getByRole("button", { name: /捕まえる/ })).toBeVisible();
      await captureScreenshot(page, testInfo, `${size.name}-3-detail`, `拡大表示（${size.name}）`, { fullPage: false });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("ⓘのモーダルは背景が透けず、閉じられる", async ({ page }, testInfo) => {
      await openApp(page);
      await page.tap(".help-btn");
      const box = page.locator(".help-box");
      await expect(box).toBeVisible();
      const bg = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).not.toMatch(/rgba\(.*, 0\)|transparent/);
      await captureScreenshot(page, testInfo, `${size.name}-4-help`, `注意文言のモーダル（${size.name}）`, { fullPage: false });
      await page.getByRole("button", { name: "閉じる" }).click();
      await expect(box).toBeHidden();
    });

    test("場所で「空」を選ぶと、行動は「飛ぶ」「鳴く」だけになる", async ({ page }) => {
      await openApp(page);
      await page.click("button[aria-label='2. どこで見たか']");
      await page.getByRole("button", { name: /空（飛んでいた）/ }).click();
      await page.click("button[aria-label='3. 行動']");
      // 絵文字（aria-hidden）を除いた、ボタンの文字だけを比べる
      const labels = await page.locator("section.step:has(h2:text('行動')) .chip").evaluateAll((els) =>
        els.map((el) =>
          Array.from(el.childNodes)
            .filter((n) => !(n instanceof HTMLElement && n.getAttribute("aria-hidden") === "true"))
            .map((n) => n.textContent ?? "")
            .join("")
            .trim(),
        ),
      );
      expect(labels).toEqual(["飛ぶ・滑空する", "鳴く・歌う"]);
    });

    test("図鑑タブ・地図タブが開き、JavaScriptのエラーが出ない", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      await page.getByRole("button", { name: /図鑑/ }).click();
      await expect(page.getByRole("heading", { name: "図鑑" })).toBeVisible();
      await captureScreenshot(page, testInfo, `${size.name}-5-dex`, `図鑑（${size.name}）`, { fullPage: false });
      await page.getByRole("button", { name: /地図/ }).click();
      await expect(page.locator(".map-wrap")).toBeVisible();
      await captureScreenshot(page, testInfo, `${size.name}-6-map`, `地図（${size.name}）`, { fullPage: false });
      expect(errors).toEqual([]);
    });
  });
}

test.describe("みんなの観察（地図）", () => {
  test("みんなの観察に切り替えると、取得できる縮尺まで寄り、共有された鳥がピンで出る。自分の記録へ戻せる", async ({ page }, testInfo) => {
    const requested: string[] = [];
    await page.route("https://*.execute-api.ap-northeast-1.amazonaws.com/**", (r) => {
      requested.push(r.request().url());
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ items: [{ speciesId: "sparrow", date: "2026-11-15", lat: 35.65, lon: 139.54 }] }),
      });
    });
    await openApp(page);
    await page.getByRole("button", { name: /地図/ }).click();
    await page.getByRole("button", { name: "みんなの観察" }).click();
    await expect(page.locator(".bird-pin.shared")).toHaveCount(1);
    await expect(page.getByText("地図を拡大すると")).toHaveCount(0);
    // 取得した区画は、バックエンドの上限（25）以内
    const tiles = new URL(requested[requested.length - 1]).searchParams.get("tiles")?.split(",") ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(25);
    await captureScreenshot(page, testInfo, "shared-map", "みんなの観察（地図）", { fullPage: false });
    await page.getByRole("button", { name: "自分の記録" }).click();
    await expect(page.locator(".bird-pin.shared")).toHaveCount(0);
  });
});

for (const size of SIZES) {
  test.describe(`入口の切り替え ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test("鳴き声から・姿から・両方で、カードの枚数が変わる。切り替えても横スクロールは出ない", async ({ page }, testInfo) => {
      await openApp(page);
      const dots = () => page.locator(".dots button").count();
      expect(await dots()).toBe(7);
      await page.getByRole("button", { name: /鳴き声から/ }).click();
      expect(await dots()).toBe(4);
      await captureScreenshot(page, testInfo, `${size.name}-7-voice-mode`, `入口: 鳴き声から（${size.name}）`, { fullPage: false });
      await page.getByRole("button", { name: /姿から/ }).click();
      expect(await dots()).toBe(6);
      await page.getByRole("button", { name: /両方/ }).click();
      expect(await dots()).toBe(7);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    });
  });
}

for (const size of SIZES) {
  test.describe(`全種の一覧 ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test("図鑑タブの全種の一覧に、全44種が並び、各行の頭に画像が出る。画像は画面に入った行だけ取得する", async ({ page }, testInfo) => {
      const wikiRequests: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("ja.wikipedia.org")) wikiRequests.push(r.url());
      });
      await openApp(page);
      const before = wikiRequests.length;
      await page.getByRole("button", { name: /図鑑/ }).click();
      await page.getByRole("button", { name: "全種の一覧" }).click();
      await expect(page.locator(".sp-row")).toHaveCount(44);
      await expect(page.locator(".sp-row .photo img").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      // 画面に入っていない行の画像は、まだ取得していない（44件を一度に取得しない）
      expect(wikiRequests.length - before).toBeLessThan(44);
      await captureScreenshot(page, testInfo, `${size.name}-8-species-list`, `全種の一覧（${size.name}）`, { fullPage: false });
    });
  });
}
