import type { Collection } from "./domain/collection";
import type { LatLon } from "./domain/privacy";
import type { Sighting } from "./domain/sightings";

const KEY = "bird-finder:collection:v1";

/** 端末へ保存できるか（プライベートブラウズ等では書き込みに失敗する）。書き込みを1回試す */
export function canSaveToStorage(): boolean {
  try {
    const k = "bird-finder:probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** localStorageが使えない（プライベートモード等）場合も例外にしない */
export function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Collection) : {};
  } catch {
    return {};
  }
}

export function saveCollection(c: Collection): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 保存できなくても演出は動作させる */
  }
}

// ---- プライバシー（位置のぼかし・自宅の登録）。どちらも端末の中にだけ保存し、送信しない ----

const SECRET_KEY = "bird-finder:privacy-secret:v1";
const HOME_KEY = "bird-finder:home:v1";
let memorySecret: string | null = null;

function randomSecret(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 位置のずらしに使う、この端末だけの秘密の値。保存できない環境では、起動中だけ有効な値を使う */
export function getPrivacySecret(): string {
  try {
    const saved = localStorage.getItem(SECRET_KEY);
    if (saved) return saved;
    const made = randomSecret();
    localStorage.setItem(SECRET_KEY, made);
    return made;
  } catch {
    memorySecret ??= randomSecret();
    return memorySecret;
  }
}

export function loadHome(): LatLon | null {
  try {
    const h = JSON.parse(localStorage.getItem(HOME_KEY) ?? "null");
    return h && typeof h.lat === "number" && typeof h.lon === "number" ? { lat: h.lat, lon: h.lon } : null;
  } catch {
    return null;
  }
}

export function saveHome(p: LatLon): boolean {
  try {
    localStorage.setItem(HOME_KEY, JSON.stringify({ lat: p.lat, lon: p.lon }));
    return true;
  } catch {
    return false;
  }
}

export function clearHome(): void {
  try {
    localStorage.removeItem(HOME_KEY);
  } catch {
    /* 消せなくても動作に影響しない */
  }
}

// ---- 捕まえた記録（見つけた場所つき）。正確な位置は端末内にだけ残す ----

const SIGHTINGS_KEY = "bird-finder:sightings:v1";

export function loadSightings(): Sighting[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SIGHTINGS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Sighting[]) : [];
  } catch {
    return [];
  }
}

export function saveSightings(list: Sighting[]): void {
  try {
    localStorage.setItem(SIGHTINGS_KEY, JSON.stringify(list));
  } catch {
    /* 保存できなくても動作に影響しない */
  }
}
