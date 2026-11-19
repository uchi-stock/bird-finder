import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Collection } from "../domain/collection";
import { Emoji } from "./Emoji";

// throw: ボールが画像の中央へ投げられる(600ms) → absorb: 画像が縮んでボールへ吸い込まれる(400ms) → shake: ボールが揺れる(900ms) → done: 中央に拡大して残す。合計1900ms
type CatchPhase = "idle" | "throw" | "absorb" | "shake" | "done";

interface Props {
  speciesId: string;
  collection: Collection;
  onCatch: (id: string) => { isNew: boolean; count: number };
  /** 捕まえたら、必ずみんなに共有する（選択制は廃止。#160）。結果の文言を返す（省略時は、共有しない） */
  onShare?: (id: string) => Promise<string>;
}

const busyPhase = (p: CatchPhase) => p === "throw" || p === "absorb" || p === "shake";

export function CatchButton({ speciesId, collection, onCatch, onShare }: Props) {
  const [phase, setPhase] = useState<CatchPhase>("idle");
  // ボールは、鳥の画像の位置（拡大表示の枠）に重ねて出す。枠を探して、そこへ入れる
  const rootRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setStage(rootRef.current?.closest(".lightbox-inner")?.querySelector(".lb-stage") ?? null);
  }, []);
  const [result, setResult] = useState<{ isNew: boolean; count: number } | null>(null);
  const [shareMsg, setShareMsg] = useState("");
  const start = () => {
    if (busyPhase(phase)) return;
    setResult(null);
    setShareMsg("");
    setPhase("throw");
    setTimeout(() => setPhase("absorb"), 600);
    setTimeout(() => setPhase("shake"), 1000);
    setTimeout(() => {
      setResult(onCatch(speciesId));
      setPhase("done");
      // 捕まえたら、必ず共有する。位置が取れない・自宅の周辺・通信失敗でも、捕まえる（図鑑への記録）は成功し、共有されなかった理由を出す
      if (onShare) void onShare(speciesId).then(setShareMsg);
    }, 1900);
  };
  const owned = collection[speciesId]?.count ?? 0;
  const busy = busyPhase(phase);
  return (
    <div className="catch" ref={rootRef}>
      <button className="catch-btn" onClick={start} disabled={busy}>
        <Emoji c="⚾" />
        {busy ? "…" : owned > 0 ? "もう一度捕まえる" : "捕まえる"}
      </button>
      {stage && phase !== "idle" && createPortal(<span className={`ball ${phase}`} aria-hidden="true" />, stage)}
      {phase === "done" && result && (
        <span className="got">
          {result.isNew ? <b className="new">NEW! </b> : null}ゲット！{result.isNew ? "" : `（${result.count}回目）`}
        </span>
      )}
      {/* 捕まえると必ず共有するため、捕まえる前に分かるよう、常に明示する */}
      {onShare && (
        <p className="share-note">捕まえると、約1kmにぼかした位置が、みんなの地図に出ます。自宅の周辺（約2km）は共有しません。あとから取り消せません。記録は期限なく保存されます。</p>
      )}
      {shareMsg && (
        <p className="share-note" role="status">
          {shareMsg}
        </p>
      )}
    </div>
  );
}
