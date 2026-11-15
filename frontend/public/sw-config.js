// プロダクト固有のService Worker設定（sw.jsはdev-standardsからsymlink共有）
self.SW_CONFIG = {
  // キャッシュ戦略・precacheUrls等を変更した際は必ず値を変更し、旧キャッシュを破棄させる
  cacheVersion: "v1",
  // sw.jsのURL基準の相対パス。GitHub Pagesのサブパス（/bird-finder/）配信に対応する
  precacheUrls: ["./"],
  // 写真取得に使うWikipedia APIをStale-While-Revalidateでキャッシュする
  apiHostnames: ["ja.wikipedia.org"],
};
