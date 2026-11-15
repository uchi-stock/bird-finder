import { blurLocation, type LatLon } from "./privacy";

/** 捕まえた記録（見つけた鳥）。正確な位置は端末内の記録にだけ残し、地図や共有にはぼかした位置を使う */
export interface Sighting {
  id: string;
  speciesId: string;
  date: string; // YYYY-MM-DD（時刻は持たない）
  lat?: number;
  lon?: number;
}

export interface MapPoint {
  key: string;
  speciesId: string;
  date: string;
  lat: number;
  lon: number;
  count: number;
}

let seq = 0;
function newId(now: Date): string {
  return `${now.getTime().toString(36)}-${(seq++).toString(36)}`;
}

/** 純粋関数: 記録を追加した新しい配列を返す（位置が無い場合は位置なしで記録する） */
export function addSighting(list: Sighting[], speciesId: string, date: string, pos: LatLon | null, now: Date): Sighting[] {
  const s: Sighting = { id: newId(now), speciesId, date, ...(pos ? { lat: pos.lat, lon: pos.lon } : {}) };
  return [...list, s];
}

/**
 * 地図に出す点を作る。位置は必ずぼかしを通す（共有と同じ見え方にそろえる）。
 * 同じ鳥・同じ日・同じ格子は1つにまとめ、件数を数える。位置の無い記録は含めない
 */
export function toMapPoints(list: Sighting[], secret: string): MapPoint[] {
  const byKey = new Map<string, MapPoint>();
  for (const s of list) {
    if (s.lat === undefined || s.lon === undefined) continue;
    const b = blurLocation({ lat: s.lat, lon: s.lon }, s.date, secret);
    const key = `${s.speciesId}|${s.date}|${b.cell}`;
    const prev = byKey.get(key);
    if (prev) prev.count++;
    else byKey.set(key, { key, speciesId: s.speciesId, date: s.date, lat: b.lat, lon: b.lon, count: 1 });
  }
  return Array.from(byKey.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function countWithoutLocation(list: Sighting[]): number {
  return list.filter((s) => s.lat === undefined || s.lon === undefined).length;
}
