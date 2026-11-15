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
