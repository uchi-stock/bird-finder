import { describe, expect, it } from "vitest";
import photosJson from "./data/photos.json";
import speciesJson from "./data/species.json";

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
