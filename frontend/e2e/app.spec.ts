import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./screenshot.js";
import { openApp, showResults } from "./helpers";

const SIZES = [
  { name: "iphone14", width: 390, height: 844 },
  { name: "iphoneSE", width: 375, height: 667 },
];

for (const size of SIZES) {
  test.describe(`スマホ幅 ${size.name}（${size.width}x${size.height}）`, () => {
    // service workerが、模擬の通信（page.route）を横取りしないよう、無効にする
    test.use({ viewport: { width: size.width, height: size.height }, serviceWorkers: "block" });

    test("初期表示: 横スクロールが出ず、ヘッダーは1行で、タブバーは下に固定される", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      const header = await page.locator(".app-header").boundingBox();
      const menu = await page.locator(".menu-btn").boundingBox();
      const h1 = await page.locator("h1").boundingBox();
      expect(header && header.height <= 60).toBe(true);
      expect(h1 && menu && h1.x + h1.width <= menu.x + 1).toBe(true);
      const tabbar = await page.locator(".tabbar").boundingBox();
      expect(tabbar && Math.abs(tabbar.y + tabbar.height - size.height) <= 1).toBe(true);
      await captureScreenshot(page, testInfo, `${size.name}-1-initial`, `初期表示（${size.name}）`, { fullPage: false });
      expect(errors).toEqual([]);
    });

    test("余白が多い画像は、被写体に寄せて正方形で切り出され、余白が少ない画像は、切り出されない（#148）", async ({ page }, testInfo) => {
      // 被写体が小さい画像（切り出す）と、大きい画像（切り出さない）を、模擬の画像で用意する
      const dims: [number, number, number][] = [[330, 330, 0.12], [330, 220, 0.46], [330, 200, 0.1], [200, 330, 0.12]];
      let n = 0;
      const index = new Map<string, number>();
      await page.route("https://thumb.wikimedia.org/**", (r) => {
        const u = r.request().url();
        if (!index.has(u)) index.set(u, n++ % 4);
        const [w, h, k] = dims[index.get(u) ?? 0];
        const rad = Math.min(w, h) * k;
        r.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          headers: { "access-control-allow-origin": "*" },
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="12" height="24" fill="#222"/><rect x="12" width="12" height="24" fill="#eee"/></pattern></defs><rect width="100%" height="100%" fill="#9bd"/><ellipse cx="${w * 0.55}" cy="${h * 0.45}" rx="${rad}" ry="${rad * 0.8}" fill="url(#p)"/></svg>`,
        });
      });
      await page.route("https://ja.wikipedia.org/api/rest_v1/page/summary/**", (r) => {
        const t = decodeURIComponent(r.request().url().split("/summary/")[1]);
        r.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ type: "standard", thumbnail: { source: `https://thumb.wikimedia.org/${encodeURIComponent(t)}.svg` }, content_urls: { desktop: { page: "https://w/x" } } }),
        });
      });
      await openApp(page);
      await showResults(page);
      await expect(page.locator(".results .thumb-sq").first()).toBeVisible();
      expect(await page.locator(".results .thumb-plain").count()).toBeGreaterThan(0);
      // 切り出した画像は、セルの中の正方形
      const box = await page.locator(".results .thumb-sq").first().boundingBox();
      expect(box && Math.abs(box.width - box.height) <= 1).toBe(true);
      await captureScreenshot(page, testInfo, `${size.name}-2-thumb-crop`, `余白の多い画像の切り出し（${size.name}）`, { fullPage: false });
    });

    test("詳細の「飛ぶ姿」も、余白が多ければ、鳥に寄せた正方形で出る（#156）", async ({ page }) => {
      // 被写体が小さい（余白が多い）模擬の画像を、立ち姿・飛ぶ姿の両方に使う
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="333" viewBox="0 0 500 333"><defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="12" height="24" fill="#222"/><rect x="12" width="12" height="24" fill="#eee"/></pattern></defs><rect width="100%" height="100%" fill="#9bd"/><ellipse cx="270" cy="150" rx="40" ry="32" fill="url(#p)"/></svg>`;
      const image = (r: import("@playwright/test").Route) => r.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" }, body: svg });
      // 後から登録した模擬が優先される。openAppが遮断するCommonsへの通信より、あとに登録する
      await openApp(page);
      await page.route("https://thumb.wikimedia.org/**", image);
      await page.route("https://upload.wikimedia.org/**", image);
      await page.route("https://ja.wikipedia.org/api/rest_v1/page/summary/**", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ type: "standard", thumbnail: { source: "https://thumb.wikimedia.org/s.svg" }, content_urls: { desktop: { page: "https://w/x" } } }) }),
      );
      await page.route("https://commons.wikimedia.org/w/api.php**", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ query: { pages: { 1: { index: 1, title: "File:Bird in flight.jpg", imageinfo: [{ thumburl: "https://upload.wikimedia.org/fly-test.svg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Bird_in_flight.jpg", extmetadata: {} }] } } } }),
        }),
      );
      await showResults(page);
      await page.locator(".results li .tile").first().tap();
      await expect(page.locator(".lightbox .lb-flight-sq")).toBeVisible();
      const box = await page.locator(".lightbox .lb-flight-sq").boundingBox();
      expect(box && Math.abs(box.width - box.height) <= 1).toBe(true);
    });

    test("条件を入力すると候補が出て、結果は1画面に収まる。カードを横にスライドできる", async ({ page }, testInfo) => {
      await openApp(page);
      await showResults(page);
      // 4枚（2×2）は、高さのある端末では1画面に収まる。低い端末（SE）では、結果エリア内のスクロールを許容する
      const fit = await page.evaluate(() => {
        const ra = document.querySelector(".results-area") as HTMLElement;
        return ra.scrollHeight <= ra.clientHeight + 1;
      });
      if (size.height >= 800) expect(fit).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
      expect(await page.locator(".results li").count()).toBe(4);
      // サムネイルは、画像を欠けさせずに全体を収める（#137）
      const fits = await page.locator(".results li .photo img").evaluateAll((els) => els.map((el) => getComputedStyle(el).objectFit));
      expect(fits.length).toBeGreaterThan(0);
      expect(fits.every((f) => f === "contain")).toBe(true);
      expect(await page.locator(".results li").count()).toBeGreaterThan(0);
      await captureScreenshot(page, testInfo, `${size.name}-2-results`, `候補の表示（${size.name}）`, { fullPage: false });
      await page.click("button[aria-label='7. 鳴き声']");
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

    test("メニューから使い方のモーダルを開ける。背景が透けず、閉じられる", async ({ page }, testInfo) => {
      await openApp(page);
      await page.tap(".menu-btn");
      await captureScreenshot(page, testInfo, `${size.name}-4-menu`, `メニュー（${size.name}）`, { fullPage: false });
      await page.getByRole("button", { name: "使い方と注意" }).tap();
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
      await page.click("button[aria-label='3. どこで見たか']");
      await page.getByRole("button", { name: /空（飛んでいた）/ }).click();
      await page.click("button[aria-label='4. 行動']");
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

    test("クイズ: 名前と4枚の写真が出て、1ラウンド（10問）遊べる。横スクロールは出ない", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      await page.getByRole("button", { name: /クイズ/ }).click();
      await page.getByRole("button", { name: /名前を見て、写真から選ぶ/ }).click();
      const group = page.getByRole("group", { name: "写真の選択肢" });
      await expect(group.getByRole("button")).toHaveCount(4);
      // 各辺44px以上で、1画面に収まる
      for (const b of await group.getByRole("button").all()) {
        const box = await b.boundingBox();
        expect(box && box.width >= 44 && box.height >= 44).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      await captureScreenshot(page, testInfo, `${size.name}-9-quiz`, `クイズの問題（${size.name}）`, { fullPage: false });
      for (let i = 0; i < 10; i++) {
        await group.getByRole("button").first().tap();
        if (i === 0) await captureScreenshot(page, testInfo, `${size.name}-9-quiz-answer`, `クイズの回答後（${size.name}）`, { fullPage: false });
        await page.getByRole("button", { name: i < 9 ? "次へ" : "結果を見る" }).tap();
      }
      await expect(page.getByRole("heading", { name: "結果" })).toBeVisible();
      await captureScreenshot(page, testInfo, `${size.name}-9-quiz-result`, `クイズの結果（${size.name}）`, { fullPage: false });
      expect(errors).toEqual([]);
    });

    test("クイズ（状況）: 手がかりと4枚の写真が出て、1ラウンド（10問）遊べる。横スクロールは出ない", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      await page.getByRole("button", { name: /クイズ/ }).click();
      await page.getByRole("button", { name: /状況を読んで、写真から選ぶ/ }).click();
      await expect(page.getByRole("heading", { name: "この状況にあてはまる鳥は？" })).toBeVisible();
      await expect(page.locator(".quiz-clues li")).toHaveCount(3);
      const group = page.getByRole("group", { name: "写真の選択肢" });
      await expect(group.getByRole("button")).toHaveCount(4);
      for (const b of await group.getByRole("button").all()) {
        const box = await b.boundingBox();
        expect(box && box.width >= 44 && box.height >= 44).toBe(true);
      }
      // クイズの選択肢の写真も、欠けさせずに全体を収める（#137）
      expect(await group.locator("img").first().evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      await captureScreenshot(page, testInfo, `${size.name}-9-quiz-situation`, `状況のクイズ（${size.name}）`, { fullPage: false });
      for (let i = 0; i < 10; i++) {
        await group.getByRole("button").first().tap();
        if (i === 0) await captureScreenshot(page, testInfo, `${size.name}-9-quiz-situation-answer`, `状況のクイズの回答後（${size.name}）`, { fullPage: false });
        await page.getByRole("button", { name: i < 9 ? "次へ" : "結果を見る" }).tap();
      }
      await expect(page.getByRole("heading", { name: "結果" })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("クイズ（鳴き声）: 名前は出ず、鳴き声は自動で再生され、再生ボタンで聞き直せて、1ラウンド（10問）遊べる", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      // 音源は偽物（Wikimedia Commonsの検索結果とMP3）
      await page.route("https://commons.wikimedia.org/w/api.php**", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            query: {
              pages: {
                "1": {
                  index: 1,
                  title: "File:Call.ogg",
                  videoinfo: [
                    {
                      url: "https://upload.wikimedia.org/call.ogg",
                      mime: "audio/ogg",
                      descriptionurl: "https://commons.wikimedia.org/wiki/File:Call.ogg",
                      derivatives: [{ src: "https://upload.wikimedia.org/call.mp3", type: "audio/mpeg" }],
                      extmetadata: { Artist: { value: "録音者" }, LicenseShortName: { value: "CC BY 4.0" } },
                    },
                  ],
                },
              },
            },
          }),
        }),
      );
      await page.route("https://upload.wikimedia.org/**/*.mp3", (r) => r.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.alloc(64) }));
      await page.getByRole("button", { name: /クイズ/ }).click();
      await page.getByRole("button", { name: /鳴き声を聞いて、写真から選ぶ/ }).click();
      await expect(page.getByRole("heading", { name: "この鳴き声の鳥は？" })).toBeVisible();
      // 自動再生の成否（ヘッドレスでは再生できない）で、ボタンの名前が変わる。どれでも、押せる状態になる
      const play = page.getByRole("button", { name: /鳴き声を聞く|もう一度聞く|止める/ });
      await expect(play).toBeEnabled();
      await expect(page.getByRole("group", { name: "写真の選択肢" }).getByRole("button")).toHaveCount(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      await captureScreenshot(page, testInfo, `${size.name}-9-quiz-call`, `鳴き声のクイズ（${size.name}）`, { fullPage: false });
      const group = page.getByRole("group", { name: "写真の選択肢" });
      for (let i = 0; i < 10; i++) {
        await expect(group.getByRole("button").first()).toBeEnabled();
        await group.getByRole("button").first().tap();
        await page.getByRole("button", { name: i < 9 ? "次へ" : "結果を見る" }).tap();
      }
      await expect(page.getByRole("heading", { name: "結果" })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("クイズ（写真→鳴き声）: 写真と4つの鳴き声が出て、1画面に収まり、1ラウンド（10問）遊べる", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      // 音源は偽物（Wikimedia Commonsの検索結果とMP3）
      await page.route("https://commons.wikimedia.org/w/api.php**", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            query: {
              pages: {
                "1": {
                  index: 1,
                  title: "File:Call.ogg",
                  videoinfo: [
                    {
                      url: "https://upload.wikimedia.org/call.ogg",
                      mime: "audio/ogg",
                      descriptionurl: "https://commons.wikimedia.org/wiki/File:Call.ogg",
                      derivatives: [{ src: "https://upload.wikimedia.org/call.mp3", type: "audio/mpeg" }],
                      extmetadata: { Artist: { value: "録音者" }, LicenseShortName: { value: "CC BY 4.0" } },
                    },
                  ],
                },
              },
            },
          }),
        }),
      );
      await page.route("https://upload.wikimedia.org/**/*.mp3", (r) => r.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.alloc(64) }));
      await page.getByRole("button", { name: /クイズ/ }).click();
      await page.getByRole("button", { name: /写真を見て、鳴き声から選ぶ/ }).click();
      await expect(page.getByRole("heading", { name: "この鳥の鳴き声は？" })).toBeVisible();
      const list = page.getByRole("list", { name: "鳴き声の選択肢" });
      await expect(list.getByRole("listitem")).toHaveCount(4);
      await expect(list.getByRole("button", { name: /鳴き声1を聞く/ })).toBeEnabled();
      // 各ボタンは44px以上で、4つの選択肢が1画面に収まる（iPhone SEでも）
      for (const b of await list.getByRole("button").all()) {
        const box = await b.boundingBox();
        expect(box && box.height >= 44).toBe(true);
      }
      const last = await list.getByRole("listitem").last().boundingBox();
      expect(last && last.y + last.height <= (page.viewportSize()?.height ?? 0)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      await captureScreenshot(page, testInfo, `${size.name}-9-quiz-photo-call`, `写真→鳴き声のクイズ（${size.name}）`, { fullPage: false });
      for (let i = 0; i < 10; i++) {
        await expect(list.getByRole("button", { name: /鳴き声1を選ぶ/ })).toBeEnabled();
        await list.getByRole("button", { name: /鳴き声1を選ぶ/ }).tap();
        await page.getByRole("button", { name: i < 9 ? "次へ" : "結果を見る" }).tap();
      }
      await expect(page.getByRole("heading", { name: "結果" })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("地図: 「ダミー（バトル用）」で、ダミーと分かる表示で、鳥が出る", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openApp(page);
      await page.getByRole("button", { name: /地図/ }).click();
      await page.getByRole("button", { name: "ダミー（バトル用）" }).click();
      await expect(page.getByText("ダミーデータです。実際の観察ではありません")).toBeVisible();
      expect(await page.locator(".bird-pin.dummy").count()).toBeGreaterThan(0);
      await expect(page.locator(".bird-pin.dummy .pin-dummy").first()).toHaveText("ダミー");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      await captureScreenshot(page, testInfo, `${size.name}-6-map-dummy`, `地図のダミー（${size.name}）`, { fullPage: false });
      expect(errors).toEqual([]);
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
  test.describe(`入口の切替ボタンなし ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test("「鳴き声から」等の切替ボタンが無く、常に7枚のカードが出る。横スクロールは出ない", async ({ page }) => {
      await openApp(page);
      await expect(page.getByRole("button", { name: /鳴き声から|姿から/ })).toHaveCount(0);
      expect(await page.locator(".dots button").count()).toBe(7);
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
