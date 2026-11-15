import { classifyHabitats, overpassQuery } from "./domain/habitat";
import type { Habitat } from "./domain/types";

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    // iOS Safari等で未対応・拒否の場合も例外にせずrejectで扱う
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("この端末では位置情報を使えません"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === 1 ? "位置情報の利用が許可されていません" : "現在地を取得できませんでした")), {
      enableHighAccuracy: true,
      timeout: 15000,
    });
  });
}

/** 現在地を取得し、周辺環境を判定する。座標は保存せず、Overpass APIへの問い合わせにだけ使う */
export async function detectHabitats(): Promise<Habitat[]> {
  const pos = await getPosition();
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: overpassQuery(pos.coords.latitude, pos.coords.longitude) }),
  }).catch(() => null);
  if (!res || !res.ok) throw new Error("周辺の地図情報を取得できませんでした");
  const json = await res.json();
  return classifyHabitats(json.elements ?? []);
}
