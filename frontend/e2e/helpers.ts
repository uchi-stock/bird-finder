import { expect, type Page, type TestInfo } from "@playwright/test";
import { captureScreenshot } from "./screenshot.js";

// 外部サービス（写真・音源・地図・環境判定）は、CIから実際に呼ばない。すべてモックして、結果を安定させる
const STUB_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCSiiiszIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//2Q==", "base64");

const BLOCKED_HOSTS = [
  "commons.wikimedia.org",
  "overpass-api.de",
  "overpass.kumi.systems",
  "overpass.private.coffee",
  "maps.mail.ru",
  "nominatim.openstreetmap.org",
  "cyberjapandata.gsi.go.jp",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

export async function mockExternal(page: Page): Promise<void> {
  // 起動時刻に依存して候補が変わらないよう、時刻は朝10時に固定する
  await page.addInitScript(() => {
    Date.prototype.getHours = () => 10;
  });
  await page.route("https://ja.wikipedia.org/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ type: "standard", thumbnail: { source: "https://upload.wikimedia.org/x/330px-a.jpg" }, content_urls: { mobile: { page: "https://ja.wikipedia.org/wiki/x" } } }),
    }),
  );
  // 画像の取得先は、すべて模擬にする（実際のWikimediaへ取りに行くと、通信の状況で、画像が抜ける）。
  // CORSのヘッダーも付ける（画像の切り出しの判定が、canvasで画像を読むため）
  const image = (r: import("@playwright/test").Route) => r.fulfill({ status: 200, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" }, body: STUB_JPEG });
  await page.route("https://upload.wikimedia.org/**", image);
  await page.route("https://thumb.wikimedia.org/**", image);
  for (const h of BLOCKED_HOSTS) await page.route(`https://${h}/**`, (r) => r.abort());
}

export async function openApp(page: Page): Promise<void> {
  await mockExternal(page);
  await page.goto("/");
  await page.waitForSelector("h1");
}

/** 「大きさ: 2」を選んで、候補を出す */
export async function showResults(page: Page): Promise<void> {
  await page.click("button[aria-label='5. 大きさ']");
  await page.click("section.step:has(h2:text('大きさ')) >> text=2");
  await page.waitForSelector(".results li .photo img");
}

/**
 * スクリーンショットを撮る。撮影前に、フォントと、画面に見えている画像の読み込みを待つ。
 * 見えている画像が読み込めていなければ、失敗させる（壊れた画像が写ったまま、通ってしまうのを防ぐ）。
 * 地図のタイル（外部の地図サービスを遮断しているため、読み込めない）は、対象外
 */
export async function shoot(page: Page, testInfo: TestInfo, name: string, caption: string, options?: { fullPage?: boolean }): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = (i: HTMLImageElement) => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && !i.closest(".leaflet-container");
    };
    const pending = [...document.images].filter((i) => visible(i) && !i.complete);
    // 読み込みを待つ。長くかかっても、5秒で打ち切る（壊れているかは、後で判定する）
    await Promise.race([
      Promise.all(pending.map((i) => new Promise((res) => { i.addEventListener("load", res, { once: true }); i.addEventListener("error", res, { once: true }); }))),
      new Promise((res) => setTimeout(res, 5000)),
    ]);
  });
  const broken = await page.evaluate(() => {
    const visible = (i: HTMLImageElement) => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && !i.closest(".leaflet-container");
    };
    return [...document.images].filter((i) => visible(i) && (!i.complete || i.naturalWidth === 0)).map((i) => i.getAttribute("src") || "(src なし)");
  });
  expect(broken, `${name}: 見えている画像が読み込めていません`).toEqual([]);
  await captureScreenshot(page, testInfo, name, caption, options);
}
