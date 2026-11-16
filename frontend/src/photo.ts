import { useEffect, useState } from "react";
import curatedJson from "./data/photos.json";

export interface BirdPhoto {
  thumbnail: string;
  pageUrl: string;
  /** 飛翔画像（Wikimedia Commons）の撮影者・ライセンス */
  credit?: string;
  license?: string;
  flight?: boolean;
  /** 背景が単純な写真へ選び直した画像（Wikimedia Commons。撮影者・ライセンスを持つ。大きさは500px） */
  curated?: boolean;
}

// 選び直した写真（frontend/scripts/curatePhotos.jsが作る）。鳥の和名をキーにする。あれば、Wikipediaの代表画像より優先する
type Curated = { thumbnail: string; pageUrl: string; credit?: string; license?: string };
const curated = curatedJson as Record<string, Curated>;

const cache = new Map<string, Promise<BirdPhoto | null>>();
// 一時的な失敗（通信エラー・5xx）をした題名。「もともと写真が無い」（404・画像なし）とは区別し、結果を残さず、再読み込みできるようにする
const failedTitles = new Set<string>();
const failureListeners = new Set<() => void>();
const retryListeners = new Set<() => void>();

/** 一時的な失敗か（通信エラー・サーバーエラー・混雑）。404などは「該当なし」として扱う */
function isTransient(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

/** Wikipedia（日本語版）の要約APIから代表画像を取得する。失敗・該当なしはnull（写真なしで動作）。一時的な失敗は記憶せず、再読み込みで取り直せる */
export function fetchPhoto(title: string): Promise<BirdPhoto | null> {
  const c = curated[title];
  if (c) return Promise.resolve({ ...c, curated: true }); // 選び直した写真があれば、通信しない
  let p = cache.get(title);
  if (!p) {
    const fail = () => {
      cache.delete(title);
      failedTitles.add(title);
      failureListeners.forEach((l) => l());
      return null;
    };
    p = fetch(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      .then((r) => (r.ok ? r.json() : isTransient(r.status) ? fail() : null))
      .then((j) => {
        if (!j || j.type === "disambiguation" || !j.thumbnail?.source) return null;
        failedTitles.delete(title);
        return { thumbnail: j.thumbnail.source as string, pageUrl: j.content_urls?.mobile?.page ?? j.content_urls?.desktop?.page } as BirdPhoto;
      })
      .catch(fail);
    cache.set(title, p);
  }
  return p;
}

/** 失敗の記録を消して、もう一度取得させる（「再読み込み」ボタン用） */
export function retryPhoto(title: string): void {
  failedTitles.delete(title);
  cache.delete(title);
  failureListeners.forEach((l) => l());
  retryListeners.forEach((l) => l());
}

export function usePhoto(title: string): BirdPhoto | null {
  const [photo, setPhoto] = useState<BirdPhoto | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    retryListeners.add(l);
    return () => void retryListeners.delete(l);
  }, []);
  useEffect(() => {
    let alive = true;
    fetchPhoto(title).then((p) => alive && setPhoto(p));
    return () => {
      alive = false;
    };
  }, [title, tick]);
  return photo;
}

/** 写真の取得が一時的に失敗したか（「もともと無い」場合はfalse） */
export function usePhotoFailed(title: string): boolean {
  const [failed, setFailed] = useState(failedTitles.has(title));
  useEffect(() => {
    const l = () => setFailed(failedTitles.has(title));
    failureListeners.add(l);
    l();
    return () => void failureListeners.delete(l);
  }, [title]);
  return failed;
}

// ---- 飛翔の画像（Wikimedia Commons） ----

const FLIGHT_TITLE = /fl(y|ies|ying|ight)|landing|take.?off|soaring|hover/i;

interface CommonsPage {
  index?: number;
  title: string;
  imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
}

/** Commonsの検索結果から、ファイル名に飛翔を示す語を含む最初の画像を選ぶ（無ければnull） */
export function pickFlightPhoto(json: { query?: { pages?: Record<string, CommonsPage> } }): BirdPhoto | null {
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

const flightCache = new Map<string, Promise<BirdPhoto | null>>();

/** 学名で飛翔画像を探す。失敗・該当なしはnull（通常の画像に戻す）。1種につき1回だけ取得する */
export function fetchFlightPhoto(scientificName: string): Promise<BirdPhoto | null> {
  let p = flightCache.get(scientificName);
  if (!p) {
    p = fetch(commonsFlightUrl(scientificName))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? pickFlightPhoto(j) : null))
      .catch(() => null);
    flightCache.set(scientificName, p);
  }
  return p;
}

export function useFlightPhoto(scientificName: string, enabled: boolean): BirdPhoto | null {
  const [photo, setPhoto] = useState<BirdPhoto | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPhoto(null);
      return;
    }
    let alive = true;
    fetchFlightPhoto(scientificName).then((ph) => alive && setPhoto(ph));
    return () => {
      alive = false;
    };
  }, [scientificName, enabled]);
  return photo;
}
