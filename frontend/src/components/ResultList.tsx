import { useState } from "react";
import type { Collection } from "../domain/collection";
import type { Candidate, Species } from "../domain/types";
import type { NowPlaying } from "../hooks/useCallPlayer";
import { closeness } from "../options";
import { CatchButton } from "./CatchButton";
import { Photo } from "./Photo";
import { PlayStatus } from "./PlayStatus";

interface Props {
  results: Candidate[];
  inputForResults: boolean;
  flying: boolean;
  reset: () => void;
  now: NowPlaying | null;
  onPlay: (sp: Species) => Promise<void>;
  isActive: (speciesId: string) => boolean;
  collection: Collection;
  onCatch: (id: string) => { isNew: boolean; count: number };
  onShare: (id: string) => Promise<string>;
}

/** 候補の一覧。カードのタップで、鳴き声の再生と拡大表示を同時に行う */
export function ResultList({ results, inputForResults, flying, reset, now, onPlay, isActive, collection, onCatch, onShare }: Props) {
  // 拡大表示中の候補
  const [zoomId, setZoomId] = useState<string | null>(null);
  return (
          <div className="results-area">
            <div className="row between">
              <h2>候補</h2>
              <button className="link" onClick={reset}>入力をクリア</button>
            </div>
            {!inputForResults ? (
              <p className="hint">上のカードを横にスライドして、覚えていることを1つ以上入力すると、近い鳥が表示されます。</p>
            ) : (
              <>
                {now && <PlayStatus now={now} />}
                <ol className="results">
                  {results.map((c) => (
                    <li
                      key={c.species.species_id}
                      className={now?.id === c.species.species_id ? "playing" : undefined}
                      onClick={(e) => {
                        // 写真の拡大・捕まえる・リンクなどのボタンは、タップの対象外
                        if ((e.target as HTMLElement).closest("button, a")) return;
                        // 再生中の鳥をもう一度タップしたときは停止だけ（拡大しない）。それ以外は再生と拡大を同時に行う
                        const stopping = isActive(c.species.species_id);
                        void onPlay(c.species);
                        if (!stopping) setZoomId(c.species.species_id);
                      }}
                    >
                      <div className="tile">
                        <Photo
                          name={c.species.name_ja}
                          scientificName={c.species.scientific_name}
                          flying={flying}
                          showNameWhenEmpty
                          zoomed={zoomId === c.species.species_id}
                          onZoomChange={(z) => setZoomId(z ? c.species.species_id : null)}
                          caption={
                            <>
                              <span className="badge">{closeness(c)}</span>
                              <p className="note">{c.species.note}</p>
                              <p className="note">鳴き声: {c.species.onomatopoeia.join(" / ") || "聞こえない"}</p>
                              <p className="reasons">
                                {c.matching.length > 0 && <span className="ok">一致: {c.matching.join("・")}</span>}
                                {c.conflicting.length > 0 && <span className="ng">不一致: {c.conflicting.join("・")}</span>}
                                {c.unknown.length > 0 && <span className="un">未入力: {c.unknown.join("・")}</span>}
                              </p>
                              {now?.id === c.species.species_id && <PlayStatus now={now} />}
                              <CatchButton speciesId={c.species.species_id} collection={collection} onCatch={onCatch} onShare={onShare} />
                            </>
                          }
                        />
                        {/* 検索結果は、画像と近さ（段階の表示。確率ではない）だけ。詳細は拡大表示へ */}
                        <span className="badges">
                          {collection[c.species.species_id] && (
                            <span className="caught" role="img" aria-label="捕獲済み">
                              ✅
                            </span>
                          )}
                          <span className="badge">{closeness(c)}</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
                {results.length === 0 && <p className="hint">近い鳥が見つかりませんでした。入力を減らすか、別の特徴に変えてみてください。</p>}
              </>
            )}
          </div>
  );
}
