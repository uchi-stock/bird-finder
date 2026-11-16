import type { Page } from "@playwright/test";

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
  await page.route("https://upload.wikimedia.org/**/*.jpg", (r) => r.fulfill({ status: 200, contentType: "image/jpeg", body: STUB_JPEG }));
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
