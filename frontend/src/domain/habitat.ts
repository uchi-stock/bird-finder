import type { Habitat } from "./types";

/** Overpass APIのelementのうち、判定に使うtagsだけを持つ最小形 */
export interface OsmElement {
  tags?: Record<string, string>;
}

const HABITAT_LABEL: Record<Habitat, string> = {
  waterside: "川辺・水辺",
  urban: "住宅街・市街地",
  woodland: "森・林・公園",
  open: "草地・農地",
};
export const HABITATS = (Object.keys(HABITAT_LABEL) as Habitat[]).map((v) => ({ v, label: HABITAT_LABEL[v] }));

/** 周辺の地物（OpenStreetMap）から環境を判定する。該当する環境をすべて返す（複数可） */
export function classifyHabitats(elements: OsmElement[]): Habitat[] {
  let water = 0;
  let buildings = 0;
  let urbanLand = 0;
  let wood = 0;
  let open = 0;
  for (const { tags: t } of elements) {
    if (!t) continue;
    if (t.natural === "water" || t.natural === "wetland" || /^(river|riverbank|stream|canal)$/.test(t.waterway ?? "")) water++;
    if (t.building) buildings++;
    if (/^(residential|commercial|retail|industrial)$/.test(t.landuse ?? "")) urbanLand++;
    if (t.natural === "wood" || t.landuse === "forest" || /^(park|garden|nature_reserve)$/.test(t.leisure ?? "")) wood++;
    if (/^(farmland|meadow|grass|orchard|vineyard)$/.test(t.landuse ?? "") || /^(grassland|scrub|heath)$/.test(t.natural ?? "")) open++;
  }
  const out: Habitat[] = [];
  if (water > 0) out.push("waterside");
  if (buildings >= 5 || urbanLand > 0) out.push("urban");
  if (wood > 0) out.push("woodland");
  if (open > 0) out.push("open");
  return out;
}

export function overpassQuery(lat: number, lon: number, radiusM = 200): string {
  const a = `(around:${radiusM},${lat},${lon})`;
  return `[out:json][timeout:15];(
nwr${a}["natural"~"^(water|wetland|wood|grassland|scrub|heath)$"];
nwr${a}["waterway"~"^(river|riverbank|stream|canal)$"];
nwr${a}["landuse"~"^(residential|commercial|retail|industrial|forest|farmland|meadow|grass|orchard|vineyard)$"];
nwr${a}["leisure"~"^(park|garden|nature_reserve)$"];
way${a}["building"];
);out tags qt 300;`;
}

/** Nominatim（逆ジオコーディング）の結果から環境を推定する簡易版。Overpassが全滅したときの代替 */
export interface NominatimResult {
  category?: string;
  class?: string;
  type?: string;
  address?: Record<string, string>;
}

export function habitatsFromNominatim(r: NominatimResult): Habitat[] {
  const cls = r.category ?? r.class ?? "";
  const type = r.type ?? "";
  const addr = r.address ?? {};
  const out = new Set<Habitat>();
  if (cls === "waterway" || (cls === "natural" && /^(water|wetland|bay)$/.test(type))) out.add("waterside");
  if (/^(river|riverbank|stream|canal)$/.test(addr.water ?? "") || addr.river || addr.stream) out.add("waterside");
  if (cls === "natural" && /^(wood|scrub|grassland|heath)$/.test(type)) out.add(type === "wood" ? "woodland" : "open");
  if (cls === "leisure" && /^(park|garden|nature_reserve)$/.test(type)) out.add("woodland");
  if (cls === "landuse" && /^(forest)$/.test(type)) out.add("woodland");
  if (cls === "landuse" && /^(farmland|meadow|grass|orchard)$/.test(type)) out.add("open");
  if (cls === "building" || cls === "highway" || (cls === "landuse" && /^(residential|commercial|retail|industrial)$/.test(type)) || addr.house_number || addr.neighbourhood || addr.quarter) out.add("urban");
  return Array.from(out);
}

/** Wikipediaのサムネイルurlを、許可されている標準サイズ（500px）に差し替える（800px等は400で拒否される） */
export function largeImageUrl(thumbnail: string, width = 500): string {
  return thumbnail.replace(/\/\d+px-/, `/${width}px-`);
}
