// プロダクト固有のService Worker設定（sw.jsはdev-standardsからsymlink共有）
self.SW_CONFIG = {
  // キャッシュ戦略・precacheUrls等を変更した際は必ず値を変更し、旧キャッシュを破棄させる
  cacheVersion: "v4",
  // sw.jsのURL基準の相対パス。GitHub Pagesのサブパス（/bird-finder/）配信に対応する
  precacheUrls: ["./"],
  // 写真の取得（Wikipedia API）・飛翔画像の検索（Commons API）・画像の実体（thumb.wikimedia.org＝Wikipediaの代表画像、upload.wikimedia.org＝Commonsの飛翔画像）を
  // Stale-While-Revalidateでキャッシュする。一度見た鳥は、オフラインでも写真が出る。
  // 画像はimgにcrossOrigin="anonymous"を付けて取得する（付けないと不透明なレスポンスになり、保存されない）。
  // 鳴き声の音源（Rangeリクエストで大きい）と地図タイルは、容量と利用規約のためキャッシュしない
  apiHostnames: ["ja.wikipedia.org", "commons.wikimedia.org", "thumb.wikimedia.org", "upload.wikimedia.org"],
};
