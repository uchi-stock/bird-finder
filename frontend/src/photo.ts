import { useEffect, useState } from "react";

export interface BirdPhoto {
  thumbnail: string;
  pageUrl: string;
  /** 飛翔画像（Wikimedia Commons）の撮影者・ライセンス */
  credit?: string;
  license?: string;
  flight?: boolean;
}

const cache = new Map<string, Promise<BirdPhoto | null>>();

/** Wikipedia（日本語版）の要約APIから代表画像を取得する。失敗時はnull（写真なしで動作） */
export function fetchPhoto(title: string): Promise<BirdPhoto | null> {
  let p = cache.get(title);
  if (!p) {
    p = fetch(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || j.type === "disambiguation" || !j.thumbnail?.source) return null;
        return { thumbnail: j.thumbnail.source as string, pageUrl: j.content_urls?.mobile?.page ?? j.content_urls?.desktop?.page } as BirdPhoto;
      })
      .catch(() => null);
    cache.set(title, p);
  }
  return p;
}

export function usePhoto(title: string): BirdPhoto | null {
  const [photo, setPhoto] = useState<BirdPhoto | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPhoto(title).then((p) => alive && setPhoto(p));
    return () => {
      alive = false;
    };
  }, [title]);
  return photo;
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
