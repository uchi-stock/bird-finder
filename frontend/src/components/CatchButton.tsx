import { useState } from "react";
import type { Collection } from "../domain/collection";
import { Emoji } from "./Emoji";

type CatchPhase = "idle" | "throw" | "shake" | "done";

interface Props {
  speciesId: string;
  collection: Collection;
  onCatch: (id: string) => { isNew: boolean; count: number };
  /** みんなに共有する。結果の文言を返す（省略時は共有の選択肢を出さない） */
  onShare?: (id: string) => Promise<string>;
}

export function CatchButton({ speciesId, collection, onCatch, onShare }: Props) {
  const [phase, setPhase] = useState<CatchPhase>("idle");
  const [result, setResult] = useState<{ isNew: boolean; count: number } | null>(null);
  // 共有は、捕まえるたびに本人が選ぶ（初期はオフ）
  const [share, setShare] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const start = () => {
    if (phase === "throw" || phase === "shake") return;
    setResult(null);
    setShareMsg("");
    setPhase("throw");
    setTimeout(() => setPhase("shake"), 600);
    setTimeout(() => {
      setResult(onCatch(speciesId));
      setPhase("done");
      if (share && onShare) void onShare(speciesId).then(setShareMsg);
    }, 1900);
  };
  const owned = collection[speciesId]?.count ?? 0;
  const busy = phase === "throw" || phase === "shake";
  return (
    <div className="catch">
      <button className="catch-btn" onClick={start} disabled={busy}>
        <Emoji c="⚾" />
        {busy ? "…" : owned > 0 ? "もう一度捕まえる" : "捕まえる"}
      </button>
      {busy && <span className={`ball ${phase}`} aria-hidden="true" />}
      {phase === "done" && result && (
        <span className="got">
          {result.isNew ? <b className="new">NEW! </b> : null}ゲット！{result.isNew ? "" : `（${result.count}回目）`}
        </span>
      )}
      {onShare && (
        <label className="share-opt">
          <input type="checkbox" checked={share} disabled={busy} onChange={(e) => setShare(e.target.checked)} />
          みんなに共有する
        </label>
      )}
      {onShare && share && (
        <p className="share-note">約1kmにぼかした位置が、みんなの地図に出ます。自宅の周辺（約2km）は共有しません。あとから取り消せません。記録は期限なく保存されます。</p>
      )}
      {shareMsg && (
        <p className="share-note" role="status">
          {shareMsg}
        </p>
      )}
    </div>
  );
}
