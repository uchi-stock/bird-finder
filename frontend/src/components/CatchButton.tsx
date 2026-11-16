import { useState } from "react";
import type { Collection } from "../domain/collection";
import { Emoji } from "./Emoji";

type CatchPhase = "idle" | "throw" | "shake" | "done";

export function CatchButton({ speciesId, collection, onCatch }: { speciesId: string; collection: Collection; onCatch: (id: string) => { isNew: boolean; count: number } }) {
  const [phase, setPhase] = useState<CatchPhase>("idle");
  const [result, setResult] = useState<{ isNew: boolean; count: number } | null>(null);
  const start = () => {
    if (phase === "throw" || phase === "shake") return;
    setResult(null);
    setPhase("throw");
    setTimeout(() => setPhase("shake"), 600);
    setTimeout(() => {
      setResult(onCatch(speciesId));
      setPhase("done");
    }, 1900);
  };
  const owned = collection[speciesId]?.count ?? 0;
  return (
    <div className="catch">
      <button className="catch-btn" onClick={start} disabled={phase === "throw" || phase === "shake"}>
        <Emoji c="⚾" />
        {phase === "throw" || phase === "shake" ? "…" : owned > 0 ? "もう一度捕まえる" : "捕まえる"}
      </button>
      {(phase === "throw" || phase === "shake") && <span className={`ball ${phase}`} aria-hidden="true" />}
      {phase === "done" && result && (
        <span className="got">
          {result.isNew ? <b className="new">NEW! </b> : null}ゲット！{result.isNew ? "" : `（${result.count}回目）`}
        </span>
      )}
    </div>
  );
}
