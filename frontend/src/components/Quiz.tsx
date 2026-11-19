import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCallAudio, playAudio, stopAudio, unlockAudio, type CallAudio } from "../callAudio";
import { buildRound, seededRng, type QuizKind, type QuizQuestion } from "../domain/quiz";
import { buildSituationRound } from "../domain/situationQuiz";
import { useOnline } from "../hooks/useOnline";
import { SPECIES, SIZES } from "../options";
import { fetchPhoto, type BirdPhoto } from "../photo";
import { loadQuizStats, saveQuizStats, type QuizStats } from "../storage";
import { Photo } from "./Photo";

const ROUND_SIZE = 10;
// 鳴き声のクイズは、音源が見つからない鳥を飛ばして別の問題に差し替えるため、予備の問題を多めに作る
const CALL_RESERVE = 6;
const byId = new Map(SPECIES.map((s) => [s.species_id, s]));

type Phase = "intro" | "loading" | "playing" | "result" | "unavailable";

/**
 * 写真から選ぶクイズ。「名前を見て選ぶ」「鳴き声を聞いて選ぶ」「状況を読んで選ぶ」の3種類。
 * 写真を取得できた鳥だけを出題する（問題の途中で破綻しない）。
 * 鳴き声の問題は、音源が見つからない・失敗したときに、その問題を飛ばして別の問題に差し替える
 */
export function Quiz() {
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>("intro");
  const [kind, setKind] = useState<QuizKind>("name");
  const [stats, setStats] = useState<QuizStats>(loadQuizStats);
  const [photos, setPhotos] = useState<Map<string, BirdPhoto>>(new Map());
  const [round, setRound] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [note, setNote] = useState("");
  // 鳴き声: 現在の問題の音源（undefined=取得中）と、再生の状態
  const [audio, setAudio] = useState<CallAudio | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  // 自動再生が始まった問題は、ボタンを「もう一度聞く」にする
  const [autoplayed, setAutoplayed] = useState(false);
  const audioCache = useRef(new Map<string, Promise<CallAudio | null>>());

  const loadAudio = useCallback((id: string) => {
    let p = audioCache.current.get(id);
    if (!p) {
      p = fetchCallAudio(byId.get(id)?.scientific_name ?? "").catch(() => null);
      audioCache.current.set(id, p);
    }
    return p;
  }, []);

  const start = useCallback(
    async (mode: QuizKind, review: boolean) => {
      // iOS対策: 音声の解錠は、タップの同期処理内（最初のawaitより前）で行う。自動再生はしない
      if (mode === "call") unlockAudio();
      setKind(mode);
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
      const prefer = review ? Object.keys(stats.wrong) : [];
      const questions =
        mode === "situation"
          ? buildSituationRound(candidates, { rng: seededRng(Date.now()), count: ROUND_SIZE, prefer })
          : buildRound(candidates, {
              rng: seededRng(Date.now()),
              count: mode === "call" ? ROUND_SIZE + CALL_RESERVE : ROUND_SIZE,
              prefer,
              kind: mode,
            });
      if (questions.length === 0) {
        setPhase("unavailable");
        return;
      }
      setRound(questions);
      setIndex(0);
      setAnswered(0);
      setPicked(null);
      setScore(0);
      setMissed([]);
      setNote("");
      setAudio(undefined);
      setPhase("playing");
    },
    [stats.wrong],
  );

  const limit = Math.min(ROUND_SIZE, round.length);
  const question = round[index];
  const answer = question ? byId.get(question.answerId) : undefined;

  // ラウンドの終了: 成績を保存する（正解した鳥は復習の対象から外し、間違えた鳥を足す）
  const finish = (finalScore: number, finalMissed: string[], asked: QuizQuestion[]) => {
    const wrong = { ...stats.wrong };
    for (const q of asked) delete wrong[q.answerId];
    for (const id of finalMissed) wrong[id] = (wrong[id] ?? 0) + 1;
    const updated: QuizStats =
      kind === "call"
        ? { ...stats, bestCall: Math.max(stats.bestCall, finalScore), wrong }
        : kind === "situation"
          ? { ...stats, bestSituation: Math.max(stats.bestSituation, finalScore), wrong }
          : { ...stats, best: Math.max(stats.best, finalScore), wrong };
    saveQuizStats(updated);
    setStats(updated);
    stopAudio();
    setPlaying(false);
    setPhase("result");
  };

  // 音源が見つからない問題を飛ばす。最新の状態を見るため、refに入れて、効果（effect）から呼ぶ
  const skipRef = useRef<() => void>(() => {});
  skipRef.current = () => {
    if (index + 1 < round.length) {
      setNote("音源が見つからなかったので、別の問題にしました。");
      setIndex(index + 1);
    } else if (answered > 0) {
      finish(score, missed, round.slice(0, index));
    } else {
      setPhase("unavailable");
    }
  };

  // 鳴き声: 現在の問題の音源を取得し、次の問題の音源を先読みする（取得に時間がかかるため）
  useEffect(() => {
    if (phase !== "playing" || kind !== "call" || !question) return;
    let alive = true;
    setAudio(undefined);
    setPlaying(false);
    setPlayFailed(false);
    setAutoplayed(false);
    // 音源が取れたら、ボタンを押さなくても自動で再生する（#123）。
    // 開始・「次へ」のタップで解錠済みの共有<audio>を使う。再生できない環境（自動再生の制限）では、
    // 例外を投げず、案内を出してボタン再生へ戻す
    const autoPlay = async (a: CallAudio) => {
      setPlaying(true);
      try {
        await playAudio(a.src, () => {
          if (alive) setPlaying(false);
        });
        if (alive) setAutoplayed(true);
      } catch {
        if (alive) {
          setPlaying(false);
          setPlayFailed(true);
        }
      }
    };
    void loadAudio(question.answerId).then((a) => {
      if (!alive) return;
      if (a) {
        setAudio(a);
        void autoPlay(a);
      } else skipRef.current();
    });
    for (const q of round.slice(index + 1, index + 3)) void loadAudio(q.answerId);
    return () => {
      alive = false;
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 問題が変わったときだけ取得する（questionはindexとroundから決まる）
  }, [phase, kind, index, round, loadAudio]);

  // 名前のクイズ: 次の問題の写真を先読みして、表示のちらつき・待ち時間を抑える
  useEffect(() => {
    if (phase !== "playing") return;
    for (const id of round[index + 1]?.choiceIds ?? []) {
      const src = photos.get(id)?.thumbnail;
      if (src) new Image().src = src;
    }
  }, [phase, round, index, photos]);

  const play = async () => {
    if (!audio) return;
    if (playing) {
      stopAudio();
      setPlaying(false);
      return;
    }
    // iOS対策: タップの同期処理内で解錠してから再生する
    unlockAudio();
    setPlayFailed(false);
    setPlaying(true);
    try {
      await playAudio(audio.src, () => setPlaying(false));
    } catch {
      setPlaying(false);
      setPlayFailed(true);
    }
  };

  const choose = (id: string) => {
    if (!question || picked) return;
    setPicked(id);
    setNote("");
    setAnswered((n) => n + 1);
    if (id === question.answerId) setScore((n) => n + 1);
    else setMissed((m) => [...m, question.answerId]);
  };

  const next = () => {
    // 次の問題の自動再生のため、このタップで改めて解錠する
    if (kind === "call") unlockAudio();
    if (answered < limit && index + 1 < round.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    finish(score, missed, round.slice(0, index + 1));
  };

  const wrongCount = useMemo(() => Object.keys(stats.wrong).length, [stats.wrong]);
  const best = kind === "call" ? stats.bestCall : kind === "situation" ? stats.bestSituation : stats.best;

  if (phase === "intro" || phase === "unavailable") {
    return (
      <section className="quiz">
        <h2>クイズ</h2>
        <p>種類を選んで、はじめます（{ROUND_SIZE}問）。</p>
        {(stats.best > 0 || stats.bestCall > 0 || stats.bestSituation > 0) && (
          <p className="hint">
            最高: 名前 {stats.best}問正解 ・ 鳴き声 {stats.bestCall}問正解 ・ 状況 {stats.bestSituation}問正解
          </p>
        )}
        {phase === "unavailable" && <p className="hint warn">問題を作れませんでした。通信を確認して、もう一度お試しください。</p>}
        <div className="quiz-actions">
          <button type="button" className="primary" onClick={() => void start("name", false)}>
            名前を見て、写真から選ぶ
          </button>
          <button type="button" className="primary" disabled={!online} onClick={() => void start("call", false)}>
            鳴き声を聞いて、写真から選ぶ
          </button>
          <button type="button" className="primary" onClick={() => void start("situation", false)}>
            状況を読んで、写真から選ぶ
          </button>
          {!online && <p className="hint">鳴き声のクイズは、オフラインでは使えません（音源を通信で取得するため）。</p>}
          {wrongCount > 0 && (
            <button type="button" onClick={() => void start("name", true)}>
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
    const missedSpecies = [...new Set(missed)].map((id) => byId.get(id)).filter((s) => s !== undefined);
    return (
      <section className="quiz">
        <h2>結果</h2>
        <p className="quiz-score">
          {score} / {answered} 問正解
        </p>
        <p className="hint">最高: {best}問正解</p>
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
          <button type="button" className="primary" onClick={() => void start(kind, false)}>
            もう一度
          </button>
          {wrongCount > 0 && (
            <button type="button" onClick={() => void start("name", true)}>
              間違えた鳥を復習（{wrongCount}種）
            </button>
          )}
          <button type="button" onClick={() => setPhase("intro")}>
            クイズの種類を選ぶ
          </button>
        </div>
      </section>
    );
  }

  if (!question || !answer) return null;
  const size = SIZES.find((s) => s.level === answer.size_level);
  const isCall = kind === "call";
  const isSituation = kind === "situation";
  return (
    <section className="quiz">
      <p className="hint quiz-progress">
        {Math.min(answered + (picked === null ? 1 : 0), limit)} / {limit} 問 ・ {score}問正解
      </p>
      {isCall ? (
        // 名前は出さない。問題が出たら自動で再生し、ボタンで何度でも聞き直せる
        <div className="quiz-call">
          <h2 className="quiz-name">この鳴き声の鳥は？</h2>
          <button type="button" className="quiz-play" onClick={() => void play()} disabled={!audio} aria-pressed={playing}>
            {audio === undefined ? "音源を探しています…" : playing ? "⏹ 止める" : autoplayed ? "🔊 もう一度聞く" : "🔊 鳴き声を聞く"}
          </button>
          {playFailed && <p className="hint warn">自動で再生できませんでした。ボタンを押してください。音が出ないときは、音量とマナーモードを確認してください。</p>}
          {note && <p className="hint">{note}</p>}
        </div>
      ) : isSituation ? (
        // 名前は出さない。状況の手がかりをすべて満たす鳥が、選択肢の中に1つだけある
        <div className="quiz-situation">
          <h2 className="quiz-name">この状況にあてはまる鳥は？</h2>
          <ul className="quiz-clues">
            {(question.clues ?? []).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <h2 className="quiz-name">{answer.name_ja}</h2>
      )}
      {picked === null && <p className="hint">{isCall ? "聞こえた鳥の写真をタップしてください" : isSituation ? "すべてにあてはまる鳥の写真をタップしてください" : "この鳥の写真をタップしてください"}</p>}
      <div className="quiz-choices" role="group" aria-label="写真の選択肢">
        {question.choiceIds.map((id, i) => {
          const photo = photos.get(id);
          const state = picked === null ? "" : id === question.answerId ? "correct" : id === picked ? "wrong" : "";
          // alt・ラベルに鳥の名前を入れない（読み上げで答えが漏れるため）。回答後は、正誤を文字でも示す
          const label = `選択肢${i + 1}${state === "correct" ? "（正解）" : state === "wrong" ? "（不正解）" : ""}`;
          return (
            <button key={id} type="button" className={`quiz-choice ${state}`} aria-label={label} disabled={(isCall && audio === undefined) || (picked !== null && state === "")} onClick={() => choose(id)}>
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
              <Photo name={answer.name_ja} scientificName={answer.scientific_name} />
            </div>
            <div className="quiz-result-text">
              <strong>{picked === question.answerId ? "⭕ 正解！" : "❌ ざんねん"}</strong>
              <span>
                {answer.name_ja}（{answer.scientific_name}）{size ? ` ・ ${size.cm}` : ""}
              </span>
              {isSituation && <span className="hint">決め手: {(question.clues ?? []).join(" ／ ")}。{answer.name_ja}は、すべてにあてはまります（図鑑データは暫定値です）。</span>}
            </div>
          </div>
          <button type="button" className="primary quiz-next" onClick={next}>
            {answered < limit && index + 1 < round.length ? "次へ" : "結果を見る"}
          </button>
          {isCall && audio && (
            <a className="quiz-credit" href={audio.pageUrl} target="_blank" rel="noreferrer">
              音源: Wikimedia Commons（録音: {audio.credit ?? "不明"} ／ {audio.license ?? "ライセンスはリンク先を参照"}）
            </a>
          )}
        </>
      )}
    </section>
  );
}
