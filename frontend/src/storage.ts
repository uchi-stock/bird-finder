import type { Collection } from "./domain/collection";

const KEY = "bird-finder:collection:v1";

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
