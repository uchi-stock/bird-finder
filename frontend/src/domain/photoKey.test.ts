import { describe, expect, it } from "vitest";
import { photoKey } from "./photoKey";

describe("photoKey: 画像のURLから、サイズによらないファイル名を取り出す", () => {
  it("サムネイルは、サイズが違っても同じキー", () => {
    const a = photoKey("https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Eurasian_tree_sparrow.jpg/330px-Eurasian_tree_sparrow.jpg");
    const b = photoKey("https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Eurasian_tree_sparrow.jpg/500px-Eurasian_tree_sparrow.jpg?utm_source=commons.wikimedia.org");
    expect(a).toBe("Eurasian_tree_sparrow.jpg");
    expect(b).toBe(a);
  });
  it("元画像（thumbでない）は、最後の区切りのファイル名", () => {
    expect(photoKey("https://upload.wikimedia.org/wikipedia/commons/5/5e/Name.jpg")).toBe("Name.jpg");
  });
  it("%エンコードされたファイル名は、戻す", () => {
    expect(photoKey("https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Tenn%C5%8Dji.jpg/500px-Tenn%C5%8Dji.jpg")).toBe("Tennōji.jpg");
  });
  it("URLでない値は、そのまま返す（例外にしない）", () => {
    expect(photoKey("not a url")).toBe("not a url");
    expect(photoKey("")).toBe("");
  });
});
