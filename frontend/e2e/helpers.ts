import { expect, type Page, type TestInfo } from "@playwright/test";
import { captureScreenshot } from "./screenshot.js";

// 外部サービス（写真・音源・地図・環境判定）は、CIから実際に呼ばない。すべてモックして、結果を安定させる
// 模擬の画像: 空色の背景に、鳥の形（体・頭・くちばし・翼）。縦横比は、実際の写真と同じ3:2
const STUB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="300" viewBox="0 0 450 300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0f5"/><stop offset="1" stop-color="#e9f3e0"/></linearGradient></defs><rect width="450" height="300" fill="url(#g)"/><ellipse cx="215" cy="160" rx="85" ry="52" fill="#6b5a4a"/><circle cx="292" cy="118" r="30" fill="#6b5a4a"/><polygon points="318,112 350,122 318,130" fill="#d99a2b"/><circle cx="300" cy="112" r="4" fill="#fff"/><path d="M150 150 Q200 80 260 140 Q215 125 150 150Z" fill="#4d3f33"/><rect x="205" y="205" width="6" height="40" fill="#3b3b3b"/><rect x="228" y="205" width="6" height="40" fill="#3b3b3b"/></svg>`;

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
  // 実際の写真と同じ縦横比（3:2）で、鳥の形が分かる模擬の画像にする（スクリーンショットで、画像が出ているかを見分けやすい）
  const image = (r: import("@playwright/test").Route) => r.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" }, body: STUB_SVG });
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
