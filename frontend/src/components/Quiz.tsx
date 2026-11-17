import { useCallback, useEffect, useMemo, useState } from "react";
import { buildRound, seededRng, type QuizQuestion } from "../domain/quiz";
import { SPECIES, SIZES } from "../options";
import { fetchPhoto, type BirdPhoto } from "../photo";
import { loadQuizStats, saveQuizStats, type QuizStats } from "../storage";
import { Photo } from "./Photo";

const ROUND_SIZE = 10;
const byId = new Map(SPECIES.map((s) => [s.species_id, s]));

type Phase = "intro" | "loading" | "playing" | "result" | "unavailable";

/** 鳥の名前を見て、写真から選ぶクイズ。写真を取得できた鳥だけを出題する（問題の途中で破綻しない） */
export function Quiz() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [stats, setStats] = useState<QuizStats>(loadQuizStats);
  const [photos, setPhotos] = useState<Map<string, BirdPhoto>>(new Map());
  const [round, setRound] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);

  const start = useCallback(
    async (review: boolean) => {
      setPhase("loading");
      // 写真を取得できた鳥だけを、出題の対象にする（取得済みの写真はキャッシュされる）
      const got = new Map<string, BirdPhoto>();
      await Promise.all(
        SPECIES.map(async (s) => {
          const p = await fetchPhoto(s.name_ja);
          if (p) got.set(s.species_id, p);
        }),
      );
      setPhotos(got);
      const candidates = SPECIES.filter((s) => got.has(s.species_id));
      const questions = buildRound(candidates, {
        rng: seededRng(Date.now()),
        count: ROUND_SIZE,
        prefer: review ? Object.keys(stats.wrong) : [],
      });
      if (questions.length === 0) {
        setPhase("unavailable");
        return;
      }
      setRound(questions);
      setIndex(0);
      setPicked(null);
      setScore(0);
      setMissed([]);
      setPhase("playing");
    },
    [stats.wrong],
  );

  // 次の問題の写真を先読みして、表示のちらつき・待ち時間を抑える
  useEffect(() => {
    if (phase !== "playing") return;
    for (const id of round[index + 1]?.choiceIds ?? []) {
      const src = photos.get(id)?.thumbnail;
      if (src) new Image().src = src;
    }
  }, [phase, round, index, photos]);

  const question = round[index];
  const answer = question ? byId.get(question.answerId) : undefined;

  const choose = (id: string) => {
    if (!question || picked) return;
    setPicked(id);
    const correct = id === question.answerId;
    if (correct) setScore((n) => n + 1);
    else setMissed((m) => [...m, question.answerId]);
  };

  const next = () => {
    if (index + 1 < round.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    // ラウンドの終了: 成績を保存する（正解した鳥は復習の対象から外し、間違えた鳥を足す）
    const wrong = { ...stats.wrong };
    for (const q of round) delete wrong[q.answerId];
    for (const id of missed) wrong[id] = (wrong[id] ?? 0) + 1;
    const updated = { best: Math.max(stats.best, score), wrong };
    saveQuizStats(updated);
    setStats(updated);
    setPhase("result");
  };

  const wrongCount = useMemo(
    () => Object.keys(stats.wrong).length,
    [stats.wrong],
  );

  if (phase === "intro" || phase === "unavailable") {
    return (
      <section className="quiz">
        <h2>クイズ</h2>
        <p>鳥の名前が出るので、写真から選びます（{ROUND_SIZE}問）。</p>
        {stats.best > 0 && <p className="hint">最高: {stats.best}問正解</p>}
        {phase === "unavailable" && (
          <p className="hint warn">
            写真を取得できませんでした。通信を確認して、もう一度お試しください。
          </p>
        )}
        <div className="quiz-actions">
          <button
            type="button"
            className="primary"
            onClick={() => void start(false)}
          >
            はじめる
          </button>
          {wrongCount > 0 && (
            <button type="button" onClick={() => void start(true)}>
              間違えた鳥を復習（{wrongCount}種）
            </button>
          )}
        </div>
      </section>
    );
  }

  if (phase === "loading") {
    return (
      <section className="quiz">
        <h2>クイズ</h2>
        <p className="hint" role="status">
          準備中…
        </p>
      </section>
    );
  }

  if (phase === "result") {
    const missedSpecies = [...new Set(missed)]
      .map((id) => byId.get(id))
      .filter((s) => s !== undefined);
    return (
      <section className="quiz">
        <h2>結果</h2>
        <p className="quiz-score">
          {score} / {round.length} 問正解
        </p>
        {missedSpecies.length > 0 && (
          <>
            <h3>間違えた鳥</h3>
            <ul className="quiz-missed">
              {missedSpecies.map((s) => (
                <li key={s.species_id}>
                  <Photo name={s.name_ja} scientificName={s.scientific_name} />
                  <span>{s.name_ja}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="quiz-actions">
          <button
            type="button"
            className="primary"
            onClick={() => void start(false)}
          >
            もう一度
          </button>
          {wrongCount > 0 && (
            <button type="button" onClick={() => void start(true)}>
              間違えた鳥を復習（{wrongCount}種）
            </button>
          )}
        </div>
      </section>
    );
  }

  if (!question || !answer) return null;
  const size = SIZES.find((s) => s.level === answer.size_level);
  return (
    <section className="quiz">
      <p className="hint quiz-progress">
        {index + 1} / {round.length} 問 ・ {score}問正解
      </p>
      <h2 className="quiz-name">{answer.name_ja}</h2>
      {picked === null && (
        <p className="hint">この鳥の写真をタップしてください</p>
      )}
      <div className="quiz-choices" role="group" aria-label="写真の選択肢">
        {question.choiceIds.map((id, i) => {
          const photo = photos.get(id);
          const state =
            picked === null
              ? ""
              : id === question.answerId
                ? "correct"
                : id === picked
                  ? "wrong"
                  : "";
          // alt・ラベルに鳥の名前を入れない（読み上げで答えが漏れるため）。回答後は、正誤を文字でも示す
          const label = `選択肢${i + 1}${state === "correct" ? "（正解）" : state === "wrong" ? "（不正解）" : ""}`;
          return (
            <button
              key={id}
              type="button"
              className={`quiz-choice ${state}`}
              aria-label={label}
              disabled={picked !== null && state === ""}
              onClick={() => choose(id)}
            >
              <img src={photo?.thumbnail} alt="" crossOrigin="anonymous" />
              {state === "correct" && (
                <span className="quiz-mark" aria-hidden="true">
                  ✓
                </span>
              )}
              {state === "wrong" && (
                <span className="quiz-mark" aria-hidden="true">
                  ✗
                </span>
              )}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <div className="quiz-feedback" role="status">
            <div className="quiz-detail">
              <Photo
                name={answer.name_ja}
                scientificName={answer.scientific_name}
              />
            </div>
            <div className="quiz-result-text">
              <strong>
                {picked === question.answerId ? "⭕ 正解！" : "❌ ざんねん"}
              </strong>
              <span>
                {answer.name_ja}（{answer.scientific_name}）
                {size ? ` ・ ${size.cm}` : ""}
              </span>
            </div>
          </div>
          <button type="button" className="primary quiz-next" onClick={next}>
            {index + 1 < round.length ? "次へ" : "結果を見る"}
          </button>
        </>
      )}
    </section>
  );
}
