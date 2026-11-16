import { useCallback, useRef, useState } from "react";
import { fetchSightings } from "../api";
import { aggregateShared, tilesInBounds, type Bounds } from "../domain/shared";
import type { MapPoint } from "../domain/sightings";

/** みんなの観察（共有された記録）を、地図の表示範囲に合わせて取得する。地図が広すぎるときは取得せず、拡大を案内する */
export function useSharedSightings() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // 地図を動かしている間に古い取得結果が上書きしないよう、最新の取得だけを使う
  const token = useRef(0);

  const load = useCallback(async (bounds: Bounds) => {
    const mine = ++token.current;
    const tiles = tilesInBounds(bounds);
    if (!tiles) {
      setPoints([]);
      setMessage("地図を拡大すると、みんなの観察を表示できます。");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const items = await fetchSightings(tiles);
      if (mine !== token.current) return;
      setPoints(aggregateShared(items));
      setMessage(items.length === 0 ? "この範囲には、まだ共有された観察がありません。" : "");
    } catch (e) {
      if (mine !== token.current) return;
      setPoints([]);
      setMessage(e instanceof Error ? e.message : "みんなの観察を取得できませんでした");
    } finally {
      if (mine === token.current) setLoading(false);
    }
  }, []);

  return { points, message, loading, load };
}
