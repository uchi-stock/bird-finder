import { useState } from "react";
import { caughtCount, type Collection } from "../domain/collection";
import { SPECIES } from "../options";
import { canSaveToStorage } from "../storage";
import { Photo } from "./Photo";
import { SpeciesList } from "./SpeciesList";

interface Props {
  collection: Collection;
  onCatch: (id: string) => { isNew: boolean; count: number };
  onShare: (id: string) => Promise<string>;
}

export function Dex({ collection, onCatch, onShare }: Props) {
  const total = SPECIES.length;
  const got = caughtCount(collection);
  // 集めた鳥（捕まえた順に埋まる）／全種の一覧（デバッグ・図鑑用）
  const [view, setView] = useState<"got" | "all">("got");
  return (
    <section>
      <h2>図鑑</h2>
      <p className="hint">
        {got} / {total} 種を捕まえた
      </p>
      {!canSaveToStorage() && <p className="hint warn">この端末の設定では、図鑑を保存できません（プライベートブラウズ等）。</p>}
      <div className="bar">
        <div style={{ width: `${(got / total) * 100}%` }} />
      </div>
      <div className="dex-view" role="group" aria-label="図鑑の表示">
        <button type="button" className={view === "got" ? "on" : ""} aria-pressed={view === "got"} onClick={() => setView("got")}>
          集めた鳥
        </button>
        <button type="button" className={view === "all" ? "on" : ""} aria-pressed={view === "all"} onClick={() => setView("all")}>
          全種の一覧
        </button>
      </div>
      {view === "all" ? (
        <SpeciesList collection={collection} onCatch={onCatch} onShare={onShare} />
      ) : (
        <ul className="dex">
          {SPECIES.map((s) => {
            const c = collection[s.species_id];
            return (
              <li key={s.species_id} className={c ? "got" : "lock"}>
                {c ? <Photo name={s.name_ja} /> : <div className="photo empty q">？</div>}
                <span>{c ? s.name_ja : "？？？"}</span>
                {c && <small>{c.count}回</small>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
