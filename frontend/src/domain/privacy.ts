// 共有する位置のぼかし。正確な位置は端末の外へ出さず、ぼかした位置だけを共有に使う。
// 1) 約1km四方の格子の中心へ丸める  2) 端末内の秘密の値＋格子＋日付から決まる、約±300mのずらしを加える
// 同じ場所・同じ日なら同じ結果になるため、何度投稿しても平均して元の位置を割り出せない。

export interface LatLon {
  lat: number;
  lon: number;
}

export const GRID_M = 1000;
export const JITTER_M = 300;
export const HOME_RADIUS_M = 2000;
const M_PER_DEG_LAT = 111_320;
const EARTH_RADIUS_M = 6_371_000;

const rad = (d: number) => (d * Math.PI) / 180;

/** 2点間の距離（メートル、ハーバーサイン） */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 日本国内（沖縄〜北海道）の緯度経度か。投稿の検証にも使う */
export function isInJapan(p: LatLon): boolean {
  return p.lat >= 24 && p.lat <= 46 && p.lon >= 122 && p.lon <= 154;
}

/** 格子（約1km四方）の添字と中心。経度方向の距離が緯度で変わるため、行（緯度の帯）ごとに経度の幅を決める */
export function gridCell(p: LatLon, sizeM = GRID_M): { key: string; center: LatLon } {
  const dLat = sizeM / M_PER_DEG_LAT;
  const row = Math.floor(p.lat / dLat);
  const centerLat = (row + 0.5) * dLat;
  const dLon = sizeM / (M_PER_DEG_LAT * Math.cos(rad(centerLat)));
  const col = Math.floor(p.lon / dLon);
  return { key: `${row}:${col}`, center: { lat: centerLat, lon: (col + 0.5) * dLon } };
}

/** 文字列→[0,1)の2つの値（cyrb53ベースのハッシュ。秘密の値を知らない人には予測できない用途） */
function unitPair(seed: string): [number, number] {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [(h1 >>> 0) / 4294967296, (h2 >>> 0) / 4294967296];
}

/**
 * 共有に使う、ぼかした位置を返す。
 * @param date 日付（YYYY-MM-DD）。日が変わると、ずらしも変わる
 * @param secret この端末だけが持つ秘密の値（送信しない）
 */
export function blurLocation(p: LatLon, date: string, secret: string): LatLon & { cell: string } {
  const { key, center } = gridCell(p);
  const [u, v] = unitPair(`${secret}|${key}|${date}`);
  const northM = (u * 2 - 1) * JITTER_M;
  const eastM = (v * 2 - 1) * JITTER_M;
  return {
    lat: center.lat + northM / M_PER_DEG_LAT,
    lon: center.lon + eastM / (M_PER_DEG_LAT * Math.cos(rad(center.lat))),
    cell: key,
  };
}

/** 自宅の周辺か（周辺で見つけた鳥は共有しない） */
export function isNearHome(p: LatLon, home: LatLon | null, radiusM = HOME_RADIUS_M): boolean {
  return home !== null && distanceM(p, home) <= radiusM;
}

export type ShareDecision = { ok: true; shared: LatLon & { cell: string } } | { ok: false; reason: string };

/** 共有してよいかを判断し、よければぼかした位置を返す */
export function decideShare(p: LatLon | null, home: LatLon | null, date: string, secret: string): ShareDecision {
  if (!p) return { ok: false, reason: "位置が取得できていないため、共有できません" };
  if (!isInJapan(p)) return { ok: false, reason: "日本国内の位置だけ共有できます" };
  if (isNearHome(p, home)) return { ok: false, reason: "自宅の周辺（約2km以内）は共有しません" };
  return { ok: true, shared: blurLocation(p, date, secret) };
}
