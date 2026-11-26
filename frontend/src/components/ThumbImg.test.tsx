import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThumbImg } from "./ThumbImg";

// photoCrops.jsonに、切り出し範囲（w=0.263）が保存されている画像（ツグミ）
const CROPPED = "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Dusky_Thrush_%28Turdus_eunomus%29_%2850585351211%29.jpg/500px-Dusky_Thrush_%28Turdus_eunomus%29_%2850585351211%29.jpg";
const UNKNOWN = "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Unknown_bird.jpg/500px-Unknown_bird.jpg";

describe("ThumbImg: 小さく切り出す画像は、大きい幅で取る（#224）", () => {
  it("保存した切り出し範囲がある画像は、大きい標準サイズの幅で取得する", () => {
    render(<ThumbImg src={CROPPED} alt="ツグミ" />);
    expect((screen.getByAltText("ツグミ") as HTMLImageElement).src).toContain("/1280px-");
  });

  it("大きい幅を取得できなかったら、元の幅（500px）へ戻す", () => {
    render(<ThumbImg src={CROPPED} alt="ツグミ" />);
    fireEvent.error(screen.getByAltText("ツグミ"));
    expect((screen.getByAltText("ツグミ") as HTMLImageElement).src).toContain("/500px-");
  });

  it("切り出し範囲が無い（読み込み後に推定する）画像は、元の幅のまま", () => {
    render(<ThumbImg src={UNKNOWN} alt="未知" />);
    expect((screen.getByAltText("未知") as HTMLImageElement).src).toContain("/500px-");
  });
});
