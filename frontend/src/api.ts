import { API_BASE } from "./config";
import type { SharedItem } from "./domain/shared";

// 共有バックエンドへの通信。送るのは、種・日付・ぼかした位置だけ

export interface ShareBody {
  speciesId: string;
  date: string;
  lat: number;
  lon: number;
}

export async function postSighting(body: ShareBody): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("オフラインのため共有できません");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/sightings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("共有できませんでした（通信を確認してください）");
  }
  if (res.status === 201) return;
  let message = "共有できませんでした";
  try {
    const j = await res.json();
    if (typeof j?.message === "string") message = j.message; // 例: 1日の投稿上限に達しました
  } catch {
    /* 既定の文言を使う */
  }
  throw new Error(message);
}

export async function fetchSightings(tiles: string[]): Promise<SharedItem[]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("オフラインのため、みんなの観察を取得できません");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/sightings?tiles=${encodeURIComponent(tiles.join(","))}`);
  } catch {
    throw new Error("みんなの観察を取得できませんでした（通信を確認してください）");
  }
  if (!res.ok) throw new Error("みんなの観察を取得できませんでした");
  const j = await res.json();
  return Array.isArray(j?.items) ? (j.items as SharedItem[]) : [];
}
