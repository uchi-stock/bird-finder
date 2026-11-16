import { describe, expect, it } from "vitest";
import photosJson from "./data/photos.json";
import speciesJson from "./data/species.json";

// 写真の選び直しは、自動でPRになり、CIが通れば反映される。人が見なくても壊れたデータが入らないよう、中身を検査する
const photos = photosJson as Record<string, { thumbnail?: string; pageUrl?: string; credit?: string; license?: string }>;
const names = new Set((speciesJson as { name_ja: string }[]).map((s) => s.name_ja));
const LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? [\d.]+)/i;

describe("photos.json（選び直した写真）", () => {
  it("鳥の名前（キー）は、収録している鳥に実在する", () => {
    for (const name of Object.keys(photos)) expect(names.has(name), name).toBe(true);
  });
  it("各項目は、Wikimediaの画像・説明ページのURLと、使えるライセンスを持つ", () => {
    for (const [name, p] of Object.entries(photos)) {
      expect(p.thumbnail, `${name}: thumbnail`).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
      expect(p.pageUrl, `${name}: pageUrl`).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(p.license, `${name}: license`).toMatch(LICENSE);
    }
  });
  it("キーが重複していない（JSONとして読めている）", () => {
    expect(Object.keys(photos).length).toBe(new Set(Object.keys(photos)).size);
  });
});
