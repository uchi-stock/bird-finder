// 飛翔の画像（Wikimedia Commons）の検索と選択。UI非依存の純粋関数（画面と、GitHub Actionsの検出スクリプトの両方から使う。
// 同じ関数で選ぶため、画面とworkflowで同じ画像が選ばれ、画像のファイル名をキーに、切り出し範囲を引ける）

/** 飛翔の画像（撮影者・ライセンスつき） */
export interface FlightPhoto {
  thumbnail: string;
  pageUrl: string;
  credit?: string;
  license?: string;
  flight: true;
}

const FLIGHT_TITLE = /fl(y|ies|ying|ight)|landing|take.?off|soaring|hover/i;

interface CommonsPage {
  index?: number;
  title: string;
  imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
}

/** Commonsの検索結果から、ファイル名に飛翔を示す語を含む最初の画像を選ぶ（無ければnull） */
export function pickFlightPhoto(json: { query?: { pages?: Record<string, CommonsPage> } }): FlightPhoto | null {
  const pages = Object.values(json?.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const pg of pages) {
    const info = pg.imageinfo?.[0];
    if (!FLIGHT_TITLE.test(pg.title) || !info?.thumburl) continue;
    const meta = info.extmetadata ?? {};
    return {
      thumbnail: info.thumburl,
      pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org/",
      credit: (meta.Artist?.value ?? "").replace(/<[^>]*>/g, "").trim() || undefined,
      license: meta.LicenseShortName?.value,
      flight: true,
    };
  }
  return null;
}

export function commonsFlightUrl(scientificName: string): string {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "15",
    gsrsearch: `"${scientificName}" "in flight"`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "500",
  });
  return `https://commons.wikimedia.org/w/api.php?${q.toString()}`;
}

/** 選び直した飛翔の画像（flightPhotos.json）。学名をキーにする。画像分類で、飛んでいる写真を選んで固定したもの（#212） */
export type CuratedFlight = Record<string, { thumbnail: string; pageUrl: string; credit?: string; license?: string }>;

/**
 * 選び直した飛翔の画像があれば返す（無ければnull）。画面と、検出workflowの両方で、検索より先に使う。
 * 題名の語による検索では見つからない鳥（題名に飛翔を示す語が無い写真しかない鳥）の画像を、補うため
 */
export function curatedFlightPhoto(curated: CuratedFlight, scientificName: string): FlightPhoto | null {
  const c = curated[scientificName];
  return c?.thumbnail ? { ...c, flight: true } : null;
}
