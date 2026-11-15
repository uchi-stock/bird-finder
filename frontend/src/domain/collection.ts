export interface CaughtEntry {
  firstAt: string; // ISO日時
  count: number;
}
export type Collection = Record<string, CaughtEntry>;

export interface CatchResult {
  collection: Collection;
  isNew: boolean;
  count: number;
}

/** 純粋関数: 捕獲を記録した新しいコレクションを返す */
export function recordCatch(collection: Collection, speciesId: string, now: Date): CatchResult {
  const prev = collection[speciesId];
  const entry: CaughtEntry = prev ? { ...prev, count: prev.count + 1 } : { firstAt: now.toISOString(), count: 1 };
  return { collection: { ...collection, [speciesId]: entry }, isNew: !prev, count: entry.count };
}

export function caughtCount(collection: Collection): number {
  return Object.keys(collection).length;
}
