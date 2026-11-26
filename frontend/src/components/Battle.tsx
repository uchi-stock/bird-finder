import { useState } from "react";
import { buildStory } from "../domain/battleStory";
import type { Collection } from "../domain/collection";
import { SPECIES } from "../options";
import { Photo } from "./Photo";

interface Props {
  /** 相手（ダミー）の鳥の種ID */
  opponentId: string;
  /** 捕まえた鳥（この中から、自分の鳥を選ぶ） */
  collection: Collection;
  onBack: () => void;
}

/**
 * バトル（#117・#221）。捕まえた鳥と、地図のダミーの鳥が、特徴を生かした短い物語で出会う。勝ち負けは無い。
 * 相手はダミー（実際の観察ではない）で、画面にも明示する
 */
export function Battle({ opponentId, collection, onBack }: Props) {
  const opp = SPECIES.find((s) => s.species_id === opponentId);
  const caught = SPECIES.filter((s) => collection[s.species_id]);
  const [mineId, setMineId] = useState<string | undefined>();
  const [step, setStep] = useState<number | undefined>(); // undefinedは、鳥を選ぶ画面
  const mine = SPECIES.find((s) => s.species_id === mineId);

  if (!opp) {
    return (
      <section className="battle">
        <h2>バトル</h2>
        <p className="hint">相手が見つかりませんでした。</p>
        <button type="button" className="chip" onClick={onBack}>
          もどる
        </button>
      </section>
    );
  }

  const story = mine ? buildStory(mine, opp, collection) : [];
  const scene = step !== undefined ? story[step] : undefined;

  return (
    <section className="battle">
      <h2>バトル</h2>
      <p className="hint dummy-note-text">
        相手は「ダミー」の{opp.name_ja}です（実際の観察ではありません）。勝ち負けはありません。鳥の特徴で、物語になります。
      </p>

      {!scene || !mine ? (
        caught.length === 0 ? (
          <p className="hint">まだ鳥を捕まえていません。「探す」や「クイズ」で鳥を捕まえると、バトルできます。</p>
        ) : (
          <>
            <h3 className="battle-sub">あなたの鳥を選ぶ</h3>
            <div className="chips">
              {caught.map((s) => (
                <button key={s.species_id} type="button" className={mineId === s.species_id ? "chip on" : "chip"} aria-pressed={mineId === s.species_id} onClick={() => setMineId(s.species_id)}>
                  {s.name_ja}
                </button>
              ))}
            </div>
            <button type="button" className="chip battle-start" disabled={!mine} onClick={() => setStep(0)}>
              はじめる
            </button>
          </>
        )
      ) : (
        <>
          <h3 className="battle-sub">
            {(step ?? 0) + 1}/{story.length} {scene.title}
          </h3>
          <div className="battle-ring">
            <div className="battle-fighter">
              <div className={`battle-motion motion-${scene.mine}`}>
                <Photo name={mine.name_ja} scientificName={mine.scientific_name} />
              </div>
              <b>{mine.name_ja}</b>
            </div>
            <div className="battle-fighter dummy">
              <div className={`battle-motion motion-${scene.opponent}`}>
                <Photo name={opp.name_ja} scientificName={opp.scientific_name} />
              </div>
              <b>（ダミー）{opp.name_ja}</b>
            </div>
          </div>
          <p className="battle-text" role="status">
            {scene.text}
          </p>
          {(step ?? 0) < story.length - 1 ? (
            <button type="button" className="chip battle-start" onClick={() => setStep((step ?? 0) + 1)}>
              つぎへ
            </button>
          ) : (
            <button type="button" className="chip battle-start" onClick={() => setStep(undefined)}>
              鳥を選びなおす
            </button>
          )}
        </>
      )}

      <button type="button" className="chip battle-back" onClick={onBack}>
        地図へもどる
      </button>
    </section>
  );
}
