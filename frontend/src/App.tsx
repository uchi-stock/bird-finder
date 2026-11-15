import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import speciesJson from "./data/species.json";
import { hasAnyInput, identify, pickTop } from "./domain/scoring";
import { caughtCount, recordCatch, type Collection } from "./domain/collection";
import { loadCollection, saveCollection } from "./storage";
import { allowedBehaviors, allowedPlaces, behaviorsAfterPlaceChange } from "./domain/choices";
import { timeSlotFromHour } from "./domain/time";
import { HABITATS, largeImageUrl } from "./domain/habitat";
import { detectHabitats } from "./location";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration.jsx";
import { UpdateNotifier } from "./components/UpdateNotifier";
import formatBuildTime from "./shared/formatBuildTime.js";
import { useFlightPhoto, usePhoto } from "./photo";
import { fetchCallAudio, playAudio, stopAudio, unlockAudio, type CallAudio } from "./callAudio";
import type { Behavior, Candidate, Color, Habitat, Observation, Place, Species, TimeSlot } from "./domain/types";

const SPECIES = speciesJson as Species[];

/** ボタンの絵文字（読み上げ対象外にするため、表示はEmojiコンポーネントを使う） */
function Emoji({ c }: { c: string }) {
  return (
    <span className="emoji" aria-hidden="true">
      {c}
    </span>
  );
}

const SIZES = [
  { level: 1, ref: "キクイタダキ", cm: "約10cm", emoji: "🐥" },
  { level: 2, ref: "スズメ", cm: "約14cm", emoji: "🐤" },
  { level: 3, ref: "ツバメ", cm: "約17cm", emoji: "🐦" },
  { level: 4, ref: "ヒヨドリ", cm: "約28cm", emoji: "🦜" },
  { level: 5, ref: "ハト", cm: "約33cm", emoji: "🕊️" },
  { level: 6, ref: "カラス", cm: "約50cm", emoji: "🦉" },
  { level: 7, ref: "アオサギ", cm: "約90cm", emoji: "🦢" },
];
const HABITAT_EMOJI: Record<Habitat, string> = { waterside: "🏞️", urban: "🏘️", woodland: "🌳", open: "🌾" };
const COLORS: { v: Color; label: string; css: string }[] = [
  { v: "brown", label: "茶", css: "#8b5a2b" },
  { v: "black", label: "黒", css: "#222" },
  { v: "white", label: "白", css: "#fff" },
  { v: "gray", label: "灰", css: "#9a9a9a" },
  { v: "blue", label: "青", css: "#2f6fd0" },
  { v: "green", label: "緑", css: "#4c9a3a" },
  { v: "yellow", label: "黄", css: "#e8c81a" },
  { v: "red", label: "赤・橙", css: "#e0662a" },
];
const BEHAVIORS: { v: Behavior; label: string; emoji: string }[] = [
  { v: "swimming", label: "泳ぐ", emoji: "🦆" },
  { v: "wading", label: "水の中に立つ・歩く", emoji: "🦩" },
  { v: "perching", label: "止まる・立つ・歩く", emoji: "🐾" },
  { v: "flying", label: "飛ぶ・滑空する", emoji: "🦅" },
  { v: "singing", label: "鳴く・歌う", emoji: "🎵" },
  { v: "foraging", label: "採食する・つつく", emoji: "🐛" },
  { v: "preening", label: "羽繕いする", emoji: "✨" },
];
const PLACES: { v: Place; label: string; emoji: string }[] = [
  { v: "feeder", label: "餌台", emoji: "🌻" },
  { v: "ground", label: "地面の上", emoji: "🌱" },
  { v: "tree", label: "木や茂みの中", emoji: "🌳" },
  { v: "wire", label: "柵や電線の上", emoji: "⚡" },
  { v: "roof", label: "建物や屋根の上", emoji: "🏠" },
  { v: "water", label: "水辺・水面", emoji: "🌊" },
  { v: "grass", label: "草むら・ヨシ原", emoji: "🌾" },
  { v: "sky", label: "空（飛んでいた）", emoji: "☁️" },
];

const TIMES: { v: TimeSlot; label: string; emoji: string }[] = [
  { v: "morning", label: "朝（〜9時ごろ）", emoji: "🌅" },
  { v: "day", label: "日中", emoji: "☀️" },
  { v: "evening", label: "夕方", emoji: "🌇" },
  { v: "night", label: "夜", emoji: "🌙" },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function closeness(c: Candidate): string {
  if (c.maxScore <= 0) return "";
  const r = c.score / c.maxScore;
  if (r >= 0.75) return "かなり近い";
  if (r >= 0.45) return "近い";
  return "候補のひとつ";
}

interface PhotoProps {
  name: string;
  scientificName?: string;
  flying?: boolean;
  /** 拡大表示の状態を親が持つ場合に指定する（省略時は自分で持つ） */
  zoomed?: boolean;
  onZoomChange?: (zoomed: boolean) => void;
  /** 拡大表示に添える内容（再生中の表示など） */
  caption?: ReactNode;
}

function Photo({ name, scientificName, flying = false, zoomed, onZoomChange, caption }: PhotoProps) {
  const standing = usePhoto(name);
  // 飛んでいる状況なら飛翔の画像を探す。見つからなければ通常の画像（多くは止まっている・立っている姿）
  const flight = useFlightPhoto(scientificName ?? "", flying && Boolean(scientificName));
  const photo = flying && flight ? flight : standing;
  const [innerOpen, setInnerOpen] = useState(false);
  const open = zoomed ?? innerOpen;
  const setOpen = (v: boolean) => (onZoomChange ? onZoomChange(v) : setInnerOpen(v));
  const [largeSrc, setLargeSrc] = useState("");
  useEffect(() => {
    if (photo) setLargeSrc(photo.flight ? photo.thumbnail : largeImageUrl(photo.thumbnail));
  }, [photo]);
  if (!photo) return <div className="photo empty">写真なし</div>;
  return (
    <>
      <div className="photo">
        <img src={photo.thumbnail} alt={name} loading="lazy" />
        {photo.flight && <span className="flight-badge">飛翔</span>}
        <button
          type="button"
          className="zoom"
          aria-label={`${name}の写真を拡大`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Emoji c="🔍" />
        </button>
      </div>
      {open && (
        <div
          className="lightbox"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <img src={largeSrc} alt={name} onError={() => setLargeSrc(photo.thumbnail)} />
          <strong className="lightbox-name">{name}</strong>
          {caption}
          <a href={photo.pageUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            {photo.flight
              ? `出典: Wikimedia Commons（撮影: ${photo.credit ?? "不明"} ／ ${photo.license ?? "ライセンスはリンク先を参照"}）`
              : `出典: Wikipedia「${name}」（画像の著作者・ライセンスはリンク先を参照）`}
          </a>
        </div>
      )}
    </>
  );
}

function PlayStatus({ now }: { now: { name: string; status: string; info?: CallAudio } }) {
  if (now.status === "loading") return <p className="hint play-status">🔍 {now.name}の音源を探しています…</p>;
  if (now.status === "none") return <p className="hint play-status">🔇 {now.name}の音源は見つかりませんでした</p>;
  if (now.status === "error") return <p className="hint play-status">⚠️ {now.name}の鳴き声を再生できませんでした（音量・マナーモードを確認してください）</p>;
  const i = now.info!;
  return (
    <p className="hint play-status">
      🔊 {now.name}（もう一度タップで停止） ・ 音源: {i.credit ?? "不明"} ／ {i.license ?? "ライセンスはリンク先"}{" "}
      <a href={i.pageUrl} target="_blank" rel="noreferrer">
        出典(Commons)
      </a>
    </p>
  );
}

type CatchPhase = "idle" | "throw" | "shake" | "done";

function CatchButton({ speciesId, collection, onCatch }: { speciesId: string; collection: Collection; onCatch: (id: string) => { isNew: boolean; count: number } }) {
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

function Dex({ collection }: { collection: Collection }) {
  const total = SPECIES.length;
  const got = caughtCount(collection);
  return (
    <section>
      <h2>図鑑</h2>
      <p className="hint">
        {got} / {total} 種を捕まえた
      </p>
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
      <p className="hint">鳥のデータは一般的な図鑑知識に基づく暫定値で、地域の調査資料での確認は未実施です（試作版）。</p>
    </section>
  );
}

export function App() {
  const [sizeLevel, setSizeLevel] = useState<number | undefined>();
  const [colors, setColors] = useState<Color[]>([]);
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [place, setPlace] = useState<Place | undefined>();
  const [date, setDate] = useState(todayStr());
  const [useDate, setUseDate] = useState(true);
  const [tab, setTab] = useState<"search" | "dex">("search");
  const [collection, setCollection] = useState<Collection>(loadCollection);
  const onCatch = (id: string) => {
    const r = recordCatch(collection, id, new Date());
    setCollection(r.collection);
    saveCollection(r.collection);
    return { isNew: r.isNew, count: r.count };
  };
  const [habitats, setHabitats] = useState<Habitat[]>([]);
  const [locMsg, setLocMsg] = useState("");
  const [locBusy, setLocBusy] = useState(false);
  const [time, setTime] = useState<TimeSlot | undefined>(() => timeSlotFromHour(new Date().getHours()));
  const [voice, setVoice] = useState("");
  const [noVoice, setNoVoice] = useState(false);

  const obs: Observation = useMemo(
    () => ({
      sizeLevel,
      colors,
      behaviors,
      place,
      month: useDate && date ? Number(date.split("-")[1]) : undefined,
      time,
      habitats,
      onomatopoeia: voice,
      noVoice,
    }),
    [sizeLevel, colors, behaviors, place, date, useDate, time, habitats, voice, noVoice],
  );
  const results = useMemo(() => pickTop(identify(obs, SPECIES)), [obs]);
  // 日付だけでは「何か入力した」とみなさない（初期値が入っているため）
  const inputForResults = hasAnyInput({ ...obs, month: undefined });

  const locate = async (auto = false) => {
    setLocBusy(true);
    setLocMsg(auto ? "現在地を確認しています…" : "");
    try {
      const found = await detectHabitats();
      setHabitats(found);
      setLocMsg(found.length > 0 ? "現在地の周辺から判定しました。違う場合はタップで修正できます。" : "周辺の環境を判定できませんでした。手動で選んでください。");
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : "現在地を取得できませんでした");
    } finally {
      setLocBusy(false);
    }
  };

  // アプリを開いた時点で現在地を取得し、周辺環境の初期値にする（StrictModeでの二重実行を防ぐ）
  const autoLocated = useRef(false);
  useEffect(() => {
    if (autoLocated.current) return;
    autoLocated.current = true;
    void locate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectPlace = (p: Place | undefined) => {
    // 場所から決まる行動（空なら飛ぶ）は自動で選び、場所を変えたら自動で入った行動は外す
    setBehaviors((prev) => behaviorsAfterPlaceChange(place, p, prev));
    setPlace(p);
  };

  // 環境・場所の変更で不可能になった選択を自動で解除する（同じような質問を繰り返さない）
  useEffect(() => {
    if (place !== undefined && !allowedPlaces(habitats).includes(place)) setPlace(undefined);
  }, [habitats, place]);
  useEffect(() => {
    const ok = allowedBehaviors(place, habitats);
    setBehaviors((prev) => (prev.every((b) => ok.includes(b)) ? prev : prev.filter((b) => ok.includes(b))));
  }, [habitats, place]);

  type NowPlaying = { id: string; name: string; status: "loading" | "playing" | "none" | "error"; info?: CallAudio };
  const [now, setNow] = useState<NowPlaying | null>(null);
  const playToken = useRef(0);
  // 拡大表示中の候補（カードのタップで、再生と同時に拡大する）
  const [zoomId, setZoomId] = useState<string | null>(null);
  // 候補をタップで鳴き声を再生（もう一度タップで停止）。iOS対策: 解錠はタップの同期処理内で行う
  const onPlay = async (sp: Species) => {
    if (now?.id === sp.species_id && (now.status === "playing" || now.status === "loading")) {
      playToken.current++;
      stopAudio();
      setNow(null);
      return;
    }
    unlockAudio();
    const token = ++playToken.current;
    setNow({ id: sp.species_id, name: sp.name_ja, status: "loading" });
    const info = await fetchCallAudio(sp.scientific_name);
    if (token !== playToken.current) return; // 別の鳥をタップした
    if (!info) {
      setNow({ id: sp.species_id, name: sp.name_ja, status: "none" });
      return;
    }
    try {
      await playAudio(info.src, () => token === playToken.current && setNow(null));
      if (token === playToken.current) setNow({ id: sp.species_id, name: sp.name_ja, status: "playing", info });
    } catch {
      if (token === playToken.current) setNow({ id: sp.species_id, name: sp.name_ja, status: "error" });
    }
  };

  const STEP_TITLES = ["周辺の環境", "どこで見たか", "行動", "鳴き声", "大きさ", "羽の色", "時間帯・観察日"];
  const stepDone = [habitats.length > 0, place !== undefined, behaviors.length > 0, voice !== "" || noVoice, sizeLevel !== undefined, colors.length > 0, time !== undefined];
  const stepsRef = useRef<HTMLDivElement>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const onStepsScroll = () => {
    const el = stepsRef.current;
    if (!el) return;
    const w = el.scrollWidth / STEP_TITLES.length;
    if (!(w > 0)) return;
    setStepIdx(Math.min(STEP_TITLES.length - 1, Math.max(0, Math.round(el.scrollLeft / w))));
  };
  const goStep = (i: number) => {
    const el = stepsRef.current;
    el?.scrollTo?.({ left: i * (el.scrollWidth / STEP_TITLES.length), behavior: "smooth" });
    setStepIdx(i);
  };
  // 飛んでいる状況（行動に「飛ぶ」、または場所が空）なら飛翔の画像を表示する
  const flying = behaviors.includes("flying") || place === "sky";

  const reset = () => {
    setSizeLevel(undefined);
    setColors([]);
    setBehaviors([]);
    setPlace(undefined);
    setTime(timeSlotFromHour(new Date().getHours()));
    setVoice("");
    setNoVoice(false);
  };

  return (
    <main className={tab === "search" ? "app fit" : "app"}>
      <ServiceWorkerRegistration swUrl={`${import.meta.env.BASE_URL}sw.js`} />
      <UpdateNotifier />
      <header className="top">
        <div>
          <h1>声しか知らない鳥を探す</h1>
          <p className="version">
            v{__APP_VERSION__} ・ 更新: {formatBuildTime(__APP_BUILD_TIME__)}
          </p>
        </div>
        <nav className="tabs">
          <button className={tab === "search" ? "tab on" : "tab"} onClick={() => setTab("search")}>
            <Emoji c="🔍" />
            探す
          </button>
          <button className={tab === "dex" ? "tab on" : "tab"} onClick={() => setTab("dex")}>
            <Emoji c="📖" />
            図鑑 {caughtCount(collection)}/{SPECIES.length}
          </button>
        </nav>
      </header>
      {tab === "dex" ? (
        <Dex collection={collection} />
      ) : (
        <>
          <div className="step-nav">
            <div className="dots">
              {STEP_TITLES.map((t, i) => (
                <button key={t} aria-label={`${i + 1}. ${t}`} className={`dot-step${i === stepIdx ? " cur" : ""}${stepDone[i] ? " done" : ""}`} onClick={() => goStep(i)} />
              ))}
            </div>
            <span className="step-title">
              {stepIdx + 1}/{STEP_TITLES.length} {STEP_TITLES[stepIdx]}　← スライド →
            </span>
          </div>
          <div className="steps" ref={stepsRef} onScroll={onStepsScroll}>
            <section className="step">
              <h2>周辺の環境（複数可）</h2>
              <button className="chip locate" onClick={() => locate()} disabled={locBusy}>
                {locBusy ? "判定中…" : <><Emoji c="📍" />現在地から判定する</>}
              </button>
              <div className="chips">
                {HABITATS.map((h) => (
                  <button key={h.v} className={habitats.includes(h.v) ? "chip on" : "chip"} onClick={() => setHabitats(toggle(habitats, h.v))}>
                    <Emoji c={HABITAT_EMOJI[h.v]} />
                    {h.label}
                  </button>
                ))}
              </div>
              {locMsg && <p className="hint">{locMsg}</p>}
              <p className="hint">現在地は、アプリを開いたときとこのボタンを押したときだけ使います。座標は保存せず、地図情報（OpenStreetMap）への問い合わせにのみ送られます。</p>
            </section>

            <section className="step">
              <h2>どこで見たか</h2>
              {habitats.length > 0 && <p className="hint">選んだ環境にある場所だけ表示しています。</p>}
              <div className="chips">
                {PLACES.filter((p) => allowedPlaces(habitats).includes(p.v)).map((p) => (
                  <button key={p.v} className={place === p.v ? "chip on" : "chip"} onClick={() => selectPlace(place === p.v ? undefined : p.v)}>
                    <Emoji c={p.emoji} />
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="step">
              <h2>行動（複数可）</h2>
              {place === "sky" && <p className="hint">空で見たので「飛ぶ」を自動で選んでいます。</p>}
              <div className="chips">
                {BEHAVIORS.filter((b) => allowedBehaviors(place, habitats).includes(b.v)).map((b) => (
                  <button key={b.v} className={behaviors.includes(b.v) ? "chip on" : "chip"} onClick={() => setBehaviors(toggle(behaviors, b.v))}>
                    <Emoji c={b.emoji} />
                    {b.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="step">
              <h2>鳴き声（オノマトペ）</h2>
              <input
                type="text"
                value={voice}
                disabled={noVoice}
                placeholder="例: ホーホケキョ、ピーヒョロロ、チチチ"
                onChange={(e) => setVoice(e.target.value)}
              />
              <div className="chips">
                <button
                  className={noVoice ? "chip on" : "chip"}
                  onClick={() => {
                    setNoVoice(!noVoice);
                    setVoice("");
                  }}
                >
                  <Emoji c="🔇" />
                  鳴き声は聞こえなかった
                </button>
              </div>
            </section>

            <section className="step">
              <h2>大きさ</h2>
              <div className="sizes">
                {SIZES.map((s) => (
                  <button key={s.level} className={sizeLevel === s.level ? "chip on" : "chip"} onClick={() => setSizeLevel(sizeLevel === s.level ? undefined : s.level)}>
                    <Emoji c={s.emoji} />
                    {s.level}
                  </button>
                ))}
              </div>
              <p className="hint">
                {sizeLevel ? `${SIZES[sizeLevel - 1].ref}くらい（${SIZES[sizeLevel - 1].cm}）` : "1（最小）〜7（最大）。もう一度タップで解除"}
              </p>
            </section>

            <section className="step">
              <h2>羽の色（複数可）</h2>
              <div className="chips">
                {COLORS.map((c) => (
                  <button key={c.v} className={colors.includes(c.v) ? "chip on" : "chip"} onClick={() => setColors(toggle(colors, c.v))}>
                    <span className="dot" style={{ background: c.css }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="step">
              <h2>時間帯</h2>
              <div className="chips">
                {TIMES.map((t) => (
                  <button key={t.v} className={time === t.v ? "chip on" : "chip"} onClick={() => setTime(time === t.v ? undefined : t.v)}>
                    <Emoji c={t.emoji} />
                    {t.label}
                  </button>
                ))}
              </div>
              <h2 className="sub">観察日</h2>
              <label className="row">
                <input type="checkbox" checked={useDate} onChange={(e) => setUseDate(e.target.checked)} />
                季節を判定に使う
              </label>
              <input type="date" value={date} disabled={!useDate} onChange={(e) => setDate(e.target.value)} />
            </section>
          </div>

          <div className="results-area">
            <div className="row between">
              <h2>候補</h2>
              <button className="link" onClick={reset}>入力をクリア</button>
            </div>
            {!inputForResults ? (
              <p className="hint">上のカードを横にスライドして、覚えていることを1つ以上入力すると、近い鳥が表示されます。</p>
            ) : (
              <>
                {now ? <PlayStatus now={now} /> : <p className="hint">※ 点数順の目安です。確率ではありません。　鳥をタップすると鳴き声を再生します。</p>}
                <ol className="results">
                  {results.map((c) => (
                    <li
                      key={c.species.species_id}
                      className={now?.id === c.species.species_id ? "playing" : undefined}
                      onClick={(e) => {
                        // 写真の拡大・捕まえる・リンクなどのボタンは、タップの対象外
                        if ((e.target as HTMLElement).closest("button, a")) return;
                        // 再生中の鳥をもう一度タップしたときは停止だけ（拡大しない）。それ以外は再生と拡大を同時に行う
                        const stopping = now?.id === c.species.species_id && (now.status === "playing" || now.status === "loading");
                        void onPlay(c.species);
                        if (!stopping) setZoomId(c.species.species_id);
                      }}
                    >
                      <div className="card">
                        <Photo
                          name={c.species.name_ja}
                          scientificName={c.species.scientific_name}
                          flying={flying}
                          zoomed={zoomId === c.species.species_id}
                          onZoomChange={(z) => setZoomId(z ? c.species.species_id : null)}
                          caption={now?.id === c.species.species_id ? <PlayStatus now={now} /> : null}
                        />
                        <div className="body">
                          <div className="row between">
                            <strong>
                              <Emoji c={now?.id === c.species.species_id && now.status === "playing" ? "🔊" : "🔈"} />
                              {c.species.name_ja}
                            </strong>
                            <span className="badge">{closeness(c)}</span>
                          </div>
                          <p className="note clamp">{c.species.note}</p>
                          <p className="note clamp">鳴き声: {c.species.onomatopoeia.join(" / ") || "聞こえない"}</p>
                          <p className="reasons">
                            {c.matching.length > 0 && <span className="ok">一致: {c.matching.join("・")}</span>}
                            {c.conflicting.length > 0 && <span className="ng">不一致: {c.conflicting.join("・")}</span>}
                          </p>
                          <CatchButton speciesId={c.species.species_id} collection={collection} onCatch={onCatch} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                {results.length === 0 && <p className="hint">近い鳥が見つかりませんでした。入力を減らすか、別の特徴に変えてみてください。</p>}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
