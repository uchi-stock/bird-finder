import type { MapPoint } from "./sightings";

// みんなの観察（共有された記録）を、地図に出すための純粋な関数。区画の規則は、バックエンド（backend/src/tile.js）と同じ

export const TILE_DEG = 0.05;
export const MAX_TILES = 25;

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface SharedItem {
  speciesId: string;
  date: string;
  lat: number;
  lon: number;
}

export function tileOf(lat: number, lon: number): string {
  return `${Math.floor(lat / TILE_DEG)}:${Math.floor(lon / TILE_DEG)}`;
}

/** 表示範囲にかかる区画の一覧。多すぎる（地図が広すぎる）場合はnull */
export function tilesInBounds(b: Bounds): string[] | null {
  const rowMin = Math.floor(b.south / TILE_DEG);
  const rowMax = Math.floor(b.north / TILE_DEG);
  const colMin = Math.floor(b.west / TILE_DEG);
  const colMax = Math.floor(b.east / TILE_DEG);
  if ((rowMax - rowMin + 1) * (colMax - colMin + 1) > MAX_TILES) return null;
  const tiles: string[] = [];
  for (let r = rowMin; r <= rowMax; r++) for (let c = colMin; c <= colMax; c++) tiles.push(`${r}:${c}`);
  return tiles;
}

/** 同じ鳥・同じ日・近い場所（約1km）の記録を1つにまとめ、件数を数える。新しい日付から並べる */
export function aggregateShared(items: SharedItem[]): MapPoint[] {
  const byKey = new Map<string, MapPoint>();
  for (const i of items) {
    const key = `${i.speciesId}|${i.date}|${i.lat.toFixed(2)}|${i.lon.toFixed(2)}`;
    const prev = byKey.get(key);
    if (prev) prev.count++;
    else byKey.set(key, { key, speciesId: i.speciesId, date: i.date, lat: i.lat, lon: i.lon, count: 1 });
  }
  return Array.from(byKey.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
