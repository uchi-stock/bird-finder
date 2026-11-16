import { classifyHabitats, habitatsFromNominatim, overpassQuery } from "./domain/habitat";
import type { LatLon } from "./domain/privacy";
import type { Habitat } from "./domain/types";

// 公開Overpassは混雑・制限で失敗しやすいため、複数の接続先へ同時に問い合わせ、最初の成功を使う
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const TIMEOUT_MS = 12000;
const CACHE_KEY = "bird-finder:habitat-cache:v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    // iOS Safari等で未対応・拒否の場合も例外にせずrejectで扱う
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("この端末では位置情報を使えません"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === 1 ? "位置情報の利用が許可されていません。iPhoneは「設定」→「Safari」→「位置情報」で許可できます。手動でも選べます" : "現在地を取得できませんでした")), {
      enableHighAccuracy: true,
      timeout: 15000,
    });
  });
}

// 外部APIの応答は形が決まっていないため any とし、受け取る側の関数（classifyHabitats等）が中身を確かめる
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function viaOverpass(lat: number, lon: number): Promise<Habitat[]> {
  const body = () => new URLSearchParams({ data: overpassQuery(lat, lon) });
  const json = await Promise.any(ENDPOINTS.map((ep) => fetchJson(ep, { method: "POST", body: body() })));
  return classifyHabitats(json.elements ?? []);
}

async function viaNominatim(lat: number, lon: number): Promise<Habitat[]> {
  const json = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lon}&accept-language=ja`);
  return habitatsFromNominatim(json);
}

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`; // 約100m単位
}

function readCache(key: string): Habitat[] | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return c && c.key === key && Date.now() - c.at < CACHE_TTL_MS ? (c.habitats as Habitat[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, habitats: Habitat[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, habitats, at: Date.now() }));
  } catch {
    /* 保存できなくても動作に影響しない */
  }
}

/** 現在地を取得し、周辺環境を判定する。座標は保存せず、地図情報の問い合わせにだけ使う（結果は約100m・1時間だけ端末に残す） */
export async function detectHabitats(): Promise<Habitat[]> {
  const pos = await getPosition();
  const { latitude: lat, longitude: lon } = pos.coords;
  const key = cacheKey(lat, lon);
  const cached = readCache(key);
  if (cached) return cached;
  let habitats: Habitat[];
  try {
    habitats = await viaOverpass(lat, lon);
  } catch {
    try {
      habitats = await viaNominatim(lat, lon);
    } catch {
      throw new Error("地図サーバーが混み合っているようです。しばらくしてから「現在地から判定する」をもう一度押すか、手動で選んでください");
    }
  }
  if (habitats.length > 0) writeCache(key, habitats);
  return habitats;
}

/** 現在地の座標を取得する（自宅の登録・共有の判断に使う。取得した座標は呼び出し側が端末内でだけ扱う） */
export async function getCoords(): Promise<LatLon> {
  const pos = await getPosition();
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}
