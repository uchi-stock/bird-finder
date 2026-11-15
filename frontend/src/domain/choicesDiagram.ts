import { ALL_BEHAVIORS, ALL_PLACES, HABITAT_PLACES, allowedBehaviors, impliedBehaviors } from "./choices";
import { BEHAVIOR_LABEL, HABITAT_LABEL, PLACE_LABEL, STEP_TITLES } from "./labels";
import type { Habitat } from "./types";

// 選択肢のツリーをMermaid記法で作る。docs/selection-options.mdの図と一致していることをテストで確認する
// （規則を変えて図を更新し忘れると、テストが失敗する）

const HABITATS = Object.keys(HABITAT_LABEL) as Habitat[];

/** 周辺の環境 → どこで見たか */
export function placesDiagram(): string {
  const lines = ["flowchart LR", '  subgraph ENV["周辺の環境"]'];
  for (const h of HABITATS) lines.push(`    H_${h}["${HABITAT_LABEL[h]}"]`);
  lines.push("  end", '  subgraph PLACE["どこで見たか"]');
  for (const p of ALL_PLACES) lines.push(`    P_${p}["${PLACE_LABEL[p]}"]`);
  lines.push("  end");
  for (const h of HABITATS) for (const p of HABITAT_PLACES[h]) lines.push(`  H_${h} --> P_${p}`);
  return lines.join("\n");
}

/** どこで見たか → 行動（空なら、飛ぶは自動で選ばれる） */
export function behaviorsDiagram(): string {
  const lines = ["flowchart LR", '  subgraph PLACE["どこで見たか"]'];
  for (const p of ALL_PLACES) lines.push(`    P_${p}["${PLACE_LABEL[p]}"]`);
  lines.push("  end", '  subgraph BEHAVIOR["行動"]');
  for (const b of ALL_BEHAVIORS) lines.push(`    B_${b}["${BEHAVIOR_LABEL[b]}"]`);
  lines.push("  end");
  for (const p of ALL_PLACES) {
    const auto = new Set(impliedBehaviors(p));
    for (const b of allowedBehaviors(p, [])) lines.push(auto.has(b) ? `  P_${p} ==>|自動で選ばれる| B_${b}` : `  P_${p} --> B_${b}`);
  }
  return lines.join("\n");
}

/** 条件を入力するカードの流れ */
export function flowDiagram(): string {
  const lines = ["flowchart LR"];
  STEP_TITLES.forEach((t, i) => lines.push(`  S${i}["${i + 1}. ${t}"]`));
  lines.push("  " + STEP_TITLES.map((_, i) => `S${i}`).join(" --> "));
  return lines.join("\n");
}
