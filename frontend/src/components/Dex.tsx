import { caughtCount, type Collection } from "../domain/collection";
import { SPECIES } from "../options";
import { canSaveToStorage } from "../storage";
import { Photo } from "./Photo";
import { PrivacySettings } from "./PrivacySettings";

export function Dex({ collection }: { collection: Collection }) {
  const total = SPECIES.length;
  const got = caughtCount(collection);
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
      <PrivacySettings />
    </section>
  );
}
