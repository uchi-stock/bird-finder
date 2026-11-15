import { useEffect, useState } from "react";

export interface BirdPhoto {
  thumbnail: string;
  pageUrl: string;
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
