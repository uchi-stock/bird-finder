import { describe, expect, it } from "vitest";
import photosJson from "./data/photos.json";
import pinsJson from "./data/photoPins.json";
import speciesJson from "./data/species.json";
import flightJson from "./data/flightPhotos.json";

// 写真の選び直しは、自動でPRになり、CIが通れば反映される。人が見なくても壊れたデータが入らないよう、中身を検査する
const photos = photosJson as Record<string, { thumbnail?: string; pageUrl?: string; credit?: string; license?: string }>;
const names = new Set((speciesJson as { name_ja: string }[]).map((s) => s.name_ja));
// 使えるライセンス（Public domainは、古い図版・絵画が大半のため使わない）と、除外する題名（標本・図版・絵画など）。frontend/scripts/photoScore.jsと同じ条件
const LICENSE = /^(CC0|CC BY(-SA)? [\d.]+)/i;
const EXCLUDED = /MHNT|NHMUK|NMNH|BMNH|\.ZOO\.|plate|painting|lithograph|engraving|specimen|museum|scroll|folio|tafel|ukiyo|taxiderm|mounted|stuffed|in flight|flying|図|图|圖|絵|画|卷|巻|写生/i;

describe("photos.json（選び直した写真）", () => {
  it("鳥の名前（キー）は、収録している鳥に実在する", () => {
    for (const name of Object.keys(photos)) expect(names.has(name), name).toBe(true);
  });
  it("各項目は、Wikimediaの画像・説明ページのURLと、使えるライセンスを持つ", () => {
    for (const [name, p] of Object.entries(photos)) {
      expect(p.thumbnail, `${name}: thumbnail`).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
      expect(p.pageUrl, `${name}: pageUrl`).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(p.license, `${name}: license`).toMatch(LICENSE);
    }
  });
  it("標本・図版・絵画・飛翔の写真は入っていない（背景が無地で、選ばれやすいため、題名で除く）", () => {
    for (const [name, p] of Object.entries(photos)) {
      const title = decodeURIComponent((p.pageUrl ?? "").split("/").pop() ?? "");
      expect(title, `${name}: ${title}`).not.toMatch(EXCLUDED);
    }
  });
  it("キーが重複していない（JSONとして読めている）", () => {
    expect(Object.keys(photos).length).toBe(new Set(Object.keys(photos)).size);
  });
});

// 人が目で選んで固定した写真（frontend/scripts/curatePhotos.jsは、これを上書きしない）。photos.jsonへ反映され、同じ条件を満たす
const pins = pinsJson as Record<string, { thumbnail?: string; pageUrl?: string; credit?: string; license?: string }>;

describe("photoPins.json（固定した写真）", () => {
  it("鳥の名前は実在し、photos.jsonの同じ鳥の写真と、同じ内容", () => {
    for (const [name, p] of Object.entries(pins)) {
      expect(names.has(name), name).toBe(true);
      expect(photos[name], `${name}: photos.jsonへ反映されている`).toEqual(p);
    }
  });
  it("Wikimediaの画像・説明ページのURLと、使えるライセンスを持ち、標本・図版・飛翔の題名ではない", () => {
    for (const [name, p] of Object.entries(pins)) {
      expect(p.thumbnail, `${name}: thumbnail`).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
      expect(p.pageUrl, `${name}: pageUrl`).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(p.license, `${name}: license`).toMatch(LICENSE);
      const title = decodeURIComponent((p.pageUrl ?? "").split("/").pop() ?? "");
      expect(title, `${name}: ${title}`).not.toMatch(EXCLUDED);
    }
  });
});

describe("species.json: 科と似た鳥（#181）", () => {
  const list = speciesJson as unknown as { species_id: string; family: string; similar: string[] }[];
  const ids = new Set(list.map((s) => s.species_id));
  it("全種に科がある", () => {
    for (const s of list) expect(s.family, s.species_id).toMatch(/科$/);
  });
  it("似た鳥は、実在し、自分自身ではなく、相互になっている", () => {
    for (const s of list) {
      for (const o of s.similar) {
        expect(ids.has(o), `${s.species_id}→${o}`).toBe(true);
        expect(o).not.toBe(s.species_id);
        expect(list.find((x) => x.species_id === o)?.similar, `${o}→${s.species_id}`).toContain(s.species_id);
      }
    }
  });
  it("ドバトとキジバトは、互いに似た鳥", () => {
    expect(list.find((s) => s.species_id === "rock_dove")?.similar).toContain("oriental_turtle_dove");
  });
});

describe("flightPhotos.json（選び直した飛翔の画像）", () => {
  const flight = flightJson as Record<string, { thumbnail: string; pageUrl: string; credit?: string; license?: string }>;
  const scientific = new Set((speciesJson as { scientific_name: string }[]).map((s) => s.scientific_name));
  it("キーは、鳥の学名。画像と説明ページは、Wikimedia Commonsのもの", () => {
    for (const [key, e] of Object.entries(flight)) {
      expect(scientific.has(key), `${key}: 鳥の学名`).toBe(true);
      // 画像のホストは、サムネイルのthumb.wikimedia.orgか、元のupload.wikimedia.org
      expect(e.thumbnail, `${key}: 画像`).toMatch(/^https:\/\/(thumb|upload)\.wikimedia\.org\//);
      expect(e.pageUrl, `${key}: 説明ページ`).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });
  it("ライセンスは、使えるもの（CC0・CC BY・CC BY-SA）", () => {
    for (const [key, e] of Object.entries(flight)) expect(e.license ?? "", `${key}: ライセンス`).toMatch(/^(CC0|CC BY(-SA)? [\d.]+)/i);
  });
});
