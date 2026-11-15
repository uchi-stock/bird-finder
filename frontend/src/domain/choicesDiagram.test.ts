import { describe, expect, it } from "vitest";
import doc from "../../../docs/selection-options.md?raw";
import { behaviorsDiagram, flowDiagram, placesDiagram } from "./choicesDiagram";

// docs/selection-options.mdの図が、実装（choices.ts）から生成した図と一致することを確認する
const blocks = [...doc.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map((m) => m[1]);

describe("選択肢ツリーのドキュメント", () => {
  it("環境→場所の図が実装と一致する", () => expect(blocks[0]).toBe(placesDiagram()));
  it("場所→行動の図が実装と一致する", () => expect(blocks[1]).toBe(behaviorsDiagram()));
  it("入力カードの流れの図が実装と一致する", () => expect(blocks[2]).toBe(flowDiagram()));
  it("飛ぶは空からだけ矢印が出る", () => {
    const flyingLines = behaviorsDiagram().split("\n").filter((l) => l.includes("B_flying"));
    expect(flyingLines.filter((l) => l.includes("P_"))).toEqual(["  P_sky ==>|自動で選ばれる| B_flying"]);
  });
});
