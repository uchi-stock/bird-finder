import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPoint } from "../domain/sightings";
import type { LatLon } from "../domain/privacy";
import type { Bounds } from "../domain/shared";
import type { DummyPoint } from "../domain/dummySpots";

interface Props {
  points: MapPoint[];
  /** 種IDから、表示名と絵文字を引く */
  speciesLabel: (id: string) => { name: string; emoji: string };
  /** 位置の無い記録の件数（地図に出せない旨の案内に使う） */
  withoutLocation: number;
  /** 現在地を取得する（失敗時はrejectする） */
  locate: () => Promise<LatLon>;
  /** みんなの観察（共有された記録）。省略すると、自分の記録だけを出す */
  shared?: { points: MapPoint[]; message: string; loading: boolean; load: (bounds: Bounds) => void };
  /** バトル試作用のダミー（実際の観察ではない）。指定すると、「みんなの観察」に、「ダミー」の札つきで混ぜて出す */
  dummy?: DummyPoint[];
}

// みんなの観察を取得できる縮尺（これより広いと、区画が多すぎて取得しない）。切り替えたとき、これより広ければ寄せる
const SHARED_MIN_ZOOM = 12;
const DEFAULT_CENTER: [number, number] = [35.65, 139.54]; // 多摩川中流域
const TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
// 出典: 地図は国土地理院、周辺環境の判定はOpenStreetMapのデータを使っているため、あわせて表示する
const ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a> ・ データ: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function popupContent(name: string, p: MapPoint): HTMLElement {
  const el = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = name;
  const info = document.createElement("div");
  info.textContent = `${p.date}・${p.count}件（約1kmの範囲）`;
  el.append(strong, info);
  return el;
}

function drawPins(layer: L.LayerGroup, list: MapPoint[], speciesLabel: Props["speciesLabel"], className: string): void {
  for (const p of list) {
    const { name, emoji } = speciesLabel(p.speciesId);
    const icon = L.divIcon({
      className,
      html: `<span class="pin-emoji">${emoji}</span>${p.count > 1 ? `<b class="pin-count">${p.count}</b>` : ""}`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    L.marker([p.lat, p.lon], { icon, title: name }).bindPopup(popupContent(name, p)).addTo(layer);
  }
}

/** ダミーのピン。破線の枠・灰色がかった色・「ダミー」の札で、本物の記録と取り違えないようにする */
function drawDummyPins(layer: L.LayerGroup, list: DummyPoint[], speciesLabel: Props["speciesLabel"]): void {
  for (const p of list) {
    const { name, emoji } = speciesLabel(p.speciesId);
    const icon = L.divIcon({
      className: "bird-pin dummy",
      html: `<span class="pin-emoji">${emoji}</span><b class="pin-dummy">ダミー</b>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const el = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = `（ダミー）${name}`;
    const warn = document.createElement("div");
    warn.textContent = "ダミーデータ（実際の観察ではありません）";
    const info = document.createElement("div");
    info.textContent = `${p.spotLabel}・いる可能性: ${p.likelihood}`;
    el.append(strong, warn, info);
    L.marker([p.lat, p.lon], { icon, title: `（ダミー）${name}` }).bindPopup(el).addTo(layer);
  }
}

/** 地図に、見つけた鳥をプロットする。位置はぼかし済みの点だけを受け取る（正確な位置は渡さない） */
export default function MapView({ points, speciesLabel, withoutLocation, locate, shared, dummy }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const sharedLayerRef = useRef<L.LayerGroup | null>(null);
  const dummyLayerRef = useRef<L.LayerGroup | null>(null);
  const [mode, setMode] = useState<"mine" | "all">("mine");
  const meRef = useRef<L.CircleMarker | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: true }).setView(DEFAULT_CENTER, 11);
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    sharedLayerRef.current = L.layerGroup().addTo(map);
    dummyLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      sharedLayerRef.current = null;
      dummyLayerRef.current = null;
      meRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (mode !== "mine") return;
    drawPins(layer, points, speciesLabel, "bird-pin");
    if (points.length > 0) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), { padding: [40, 40], maxZoom: 14 });
  }, [points, speciesLabel, mode]);

  // みんなの観察: 表示範囲が変わるたびに、その範囲の記録を取得する（動かしている間は待つ）
  const loadShared = shared?.load;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "all" || !loadShared) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = () => {
      const b = map.getBounds();
      loadShared({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    };
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(request, 500);
    };
    request();
    if (map.getZoom() < SHARED_MIN_ZOOM) map.setZoom(SHARED_MIN_ZOOM); // 寄せた後のmoveendで、あらためて取得する
    map.on("moveend", onMove);
    return () => {
      clearTimeout(timer);
      map.off("moveend", onMove);
    };
  }, [mode, loadShared]);

  const sharedPoints = shared?.points;
  useEffect(() => {
    const layer = sharedLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (mode === "all" && sharedPoints) drawPins(layer, sharedPoints, speciesLabel, "bird-pin shared");
  }, [sharedPoints, speciesLabel, mode]);

  // ダミー: 「みんなの観察」に、本物の記録と別のレイヤーで混ぜる（札・破線の枠で区別する）。本物の記録の取得・表示には影響しない
  useEffect(() => {
    const layer = dummyLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (mode === "all" && dummy) drawDummyPins(layer, dummy, speciesLabel);
  }, [dummy, speciesLabel, mode]);

  const goToMe = async () => {
    setBusy(true);
    setMsg("");
    try {
      const me = await locate();
      const map = mapRef.current;
      if (!map) return;
      meRef.current?.remove();
      meRef.current = L.circleMarker([me.lat, me.lon], { radius: 8, color: "#1d6fe0", fillColor: "#3b8cff", fillOpacity: 0.9 }).addTo(map);
      map.setView([me.lat, me.lon], 14);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "現在地を取得できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="map-wrap">
      <div className="map-canvas" ref={elRef} data-testid="map-canvas" />
      {shared && (
        <div className="map-mode" role="group" aria-label="表示する記録">
          <button type="button" className={mode === "mine" ? "on" : ""} aria-pressed={mode === "mine"} onClick={() => setMode("mine")}>
            自分の記録
          </button>
          <button type="button" className={mode === "all" ? "on" : ""} aria-pressed={mode === "all"} onClick={() => setMode("all")}>
            みんなの観察
          </button>
        </div>
      )}
      <button type="button" className="map-locate" onClick={goToMe} disabled={busy}>
        <span className="emoji" aria-hidden="true">
          📍
        </span>
        {busy ? "取得中…" : "現在地へ"}
      </button>
      {mode === "all" && shared && (shared.loading || shared.message || (dummy && dummy.length > 0)) && (
        <p className={dummy && dummy.length > 0 ? "map-note dummy-note" : "map-note"} role="status">
          {shared.loading ? "みんなの観察を取得しています…" : shared.message}
          {dummy && dummy.length > 0 && <>{shared.loading || shared.message ? " " : ""}「ダミー」の札つきのピンは、実際の観察ではありません（バトルの試作用）。</>}
        </p>
      )}
      {mode === "mine" && points.length === 0 && (
        <p className="map-note" role="status">
          見つけた場所つきの記録がありません。鳥を捕まえると、見つけた場所（約1kmにぼかした位置）がここに出ます。
        </p>
      )}
      {withoutLocation > 0 && <p className="map-note small">位置が取れなかった記録が{withoutLocation}件あります（地図には出ません）。</p>}
      {msg && <p className="map-note small">{msg}</p>}
    </div>
  );
}
