import { useMemo, useState } from "react";
import { recordCatch, type Collection } from "../domain/collection";
import { addSighting, toMapPoints, type Sighting } from "../domain/sightings";
import { getCoords } from "../location";
import { todayStr } from "../options";
import { getPrivacySecret, loadCollection, loadSightings, saveCollection, saveSightings } from "../storage";

/** 図鑑（捕まえた鳥）と、観察の記録（場所・日付）。どちらも端末の中に保存する */
export function useCollection() {
  const [sightings, setSightings] = useState<Sighting[]>(loadSightings);
  const [collection, setCollection] = useState<Collection>(loadCollection);
  const onCatch = (id: string) => {
    const r = recordCatch(collection, id, new Date());
    setCollection(r.collection);
    saveCollection(r.collection);
    void recordSighting(id);
    return { isNew: r.isNew, count: r.count };
  };
  // 捕まえた場所（現在地）と日付を、端末内の記録に追加する。位置が取れなければ位置なしで記録する
  const recordSighting = async (id: string) => {
    let pos = null;
    try {
      pos = await getCoords();
    } catch {
      /* 位置なしで記録する */
    }
    setSightings((prev) => {
      const next = addSighting(prev, id, todayStr(), pos, new Date());
      saveSightings(next);
      return next;
    });
  };
  // 地図に出す点。位置は必ずぼかしを通す（正確な位置は地図に渡さない）
  const mapPoints = useMemo(() => toMapPoints(sightings, getPrivacySecret()), [sightings]);

  return { collection, sightings, mapPoints, onCatch };
}
