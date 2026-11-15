import { useMemo, useState } from "react";
import speciesJson from "./data/species.json";
import { hasAnyInput, identify, pickTop } from "./domain/scoring";
import { caughtCount, recordCatch, type Collection } from "./domain/collection";
import { loadCollection, saveCollection } from "./storage";
import { HABITATS } from "./domain/habitat";
import { detectHabitats } from "./location";
import { usePhoto } from "./photo";
import type { Behavior, Candidate, Color, Habitat, Observation, Place, Species, TimeSlot } from "./domain/types";

const SPECIES = speciesJson as Species[];

const SIZES = [
  { level: 1, ref: "キクイタダキ", cm: "約10cm" },
  { level: 2, ref: "スズメ", cm: "約14cm" },
  { level: 3, ref: "ツバメ", cm: "約17cm" },
  { level: 4, ref: "ヒヨドリ", cm: "約28cm" },
  { level: 5, ref: "ハト", cm: "約33cm" },
  { level: 6, ref: "カラス", cm: "約50cm" },
  { level: 7, ref: "アオサギ", cm: "約90cm" },
];
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
const BEHAVIORS: { v: Behavior; label: string }[] = [
  { v: "swimming", label: "泳ぐ・水辺を歩く" },
  { v: "perching", label: "止まる・立つ" },
  { v: "flying", label: "飛ぶ・滑空する" },
  { v: "singing", label: "鳴く・歌う" },
  { v: "foraging", label: "採食する・つつく" },
  { v: "preening", label: "羽繕いする" },
];
const PLACES: { v: Place; label: string }[] = [
  { v: "feeder", label: "餌台" },
  { v: "ground", label: "地面の上" },
  { v: "tree", label: "木や茂みの中" },
  { v: "wire", label: "柵や電線の上" },
  { v: "roof", label: "建物や屋根の上" },
  { v: "water", label: "水辺・水面" },
  { v: "grass", label: "草むら・ヨシ原" },
];

const TIMES: { v: TimeSlot; label: string }[] = [
  { v: "morning", label: "朝（〜9時ごろ）" },
  { v: "day", label: "日中" },
  { v: "evening", label: "夕方" },
  { v: "night", label: "夜" },
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

function Photo({ name }: { name: string }) {
  const photo = usePhoto(name);
  const [open, setOpen] = useState(false);
  if (!photo) return <div className="photo empty">写真なし</div>;
  return (
    <>
      <button className="photo" onClick={() => setOpen(true)} aria-label={`${name}の写真を拡大`}>
        <img src={photo.thumbnail} alt={name} loading="lazy" />
      </button>
      {open && (
        <div className="lightbox" onClick={() => setOpen(false)}>
          <img src={photo.thumbnail.replace(/\/\d+px-/, "/800px-")} alt={name} />
          <a href={photo.pageUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            出典: Wikipedia「{name}」（画像の著作者・ライセンスはリンク先を参照）
          </a>
        </div>
      )}
    </>
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
  const [time, setTime] = useState<TimeSlot | undefined>();
  const [voice, setVoice] = useState("");

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
    }),
    [sizeLevel, colors, behaviors, place, date, useDate, time, habitats, voice],
  );
  const results = useMemo(() => pickTop(identify(obs, SPECIES)), [obs]);
  // 日付だけでは「何か入力した」とみなさない（初期値が入っているため）
  const inputForResults = hasAnyInput({ ...obs, month: undefined });

  const locate = async () => {
    setLocBusy(true);
    setLocMsg("");
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

  const reset = () => {
    setSizeLevel(undefined);
    setColors([]);
    setBehaviors([]);
    setPlace(undefined);
    setTime(undefined);
    setHabitats([]);
    setLocMsg("");
    setVoice("");
  };

  return (
    <main className="app">
      <h1>声しか知らない鳥を探す</h1>
      <nav className="tabs">
        <button className={tab === "search" ? "tab on" : "tab"} onClick={() => setTab("search")}>
          探す
        </button>
        <button className={tab === "dex" ? "tab on" : "tab"} onClick={() => setTab("dex")}>
          図鑑 {caughtCount(collection)}/{SPECIES.length}
        </button>
      </nav>
      {tab === "dex" ? <Dex collection={collection} /> : <>
      <p className="lead">覚えていることだけ入力してください。分からない項目は飛ばしてOKです。</p>

      <section>
        <h2>鳴き声（オノマトペ）</h2>
        <input
          type="text"
          value={voice}
          placeholder="例: ホーホケキョ、ピーヒョロロ、チチチ"
          onChange={(e) => setVoice(e.target.value)}
        />
      </section>

      <section>
        <h2>大きさ</h2>
        <div className="sizes">
          {SIZES.map((s) => (
            <button
              key={s.level}
              className={sizeLevel === s.level ? "chip on" : "chip"}
              onClick={() => setSizeLevel(sizeLevel === s.level ? undefined : s.level)}
            >
              {s.level}
            </button>
          ))}
        </div>
        <p className="hint">
          {sizeLevel
            ? `${SIZES[sizeLevel - 1].ref}くらい（${SIZES[sizeLevel - 1].cm}）`
            : "1（最小）〜7（最大）。もう一度タップで解除"}
        </p>
      </section>

      <section>
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

      <section>
        <h2>行動（複数可）</h2>
        <div className="chips">
          {BEHAVIORS.map((b) => (
            <button key={b.v} className={behaviors.includes(b.v) ? "chip on" : "chip"} onClick={() => setBehaviors(toggle(behaviors, b.v))}>
              {b.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>どこで見たか</h2>
        <div className="chips">
          {PLACES.map((p) => (
            <button key={p.v} className={place === p.v ? "chip on" : "chip"} onClick={() => setPlace(place === p.v ? undefined : p.v)}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>周辺の環境（複数可）</h2>
        <button className="chip locate" onClick={locate} disabled={locBusy}>
          {locBusy ? "判定中…" : "📍 現在地から判定する"}
        </button>
        <p className="hint">ボタンを押したときだけ現在地を使います。座標は保存せず、地図情報（OpenStreetMap）への問い合わせにのみ送られます。</p>
        <div className="chips">
          {HABITATS.map((h) => (
            <button key={h.v} className={habitats.includes(h.v) ? "chip on" : "chip"} onClick={() => setHabitats(toggle(habitats, h.v))}>
              {h.label}
            </button>
          ))}
        </div>
        {locMsg && <p className="hint">{locMsg}</p>}
      </section>

      <section>
        <h2>時間帯</h2>
        <div className="chips">
          {TIMES.map((t) => (
            <button key={t.v} className={time === t.v ? "chip on" : "chip"} onClick={() => setTime(time === t.v ? undefined : t.v)}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>観察日</h2>
        <label className="row">
          <input type="checkbox" checked={useDate} onChange={(e) => setUseDate(e.target.checked)} />
          季節を判定に使う
        </label>
        <input type="date" value={date} disabled={!useDate} onChange={(e) => setDate(e.target.value)} />
      </section>

      <section>
        <div className="row between">
          <h2>候補</h2>
          <button className="link" onClick={reset}>入力をクリア</button>
        </div>
        {!inputForResults ? (
          <p className="hint">上の項目を1つ以上入力すると、近い鳥が表示されます。</p>
        ) : (
          <>
            <p className="hint">※ 点数順の目安です。確率ではありません。</p>
            <ol className="results">
              {results.map((c) => (
                <li key={c.species.species_id}>
                  <div className="card">
                    <Photo name={c.species.name_ja} />
                    <div className="body">
                      <div className="row between">
                        <strong>{c.species.name_ja}</strong>
                        <span className="badge">{closeness(c)}</span>
                      </div>
                      <p className="note">{c.species.note}</p>
                  <p className="reasons">
                    {c.matching.length > 0 && <span className="ok">一致: {c.matching.join("・")}</span>}
                    {c.conflicting.length > 0 && <span className="ng">不一致: {c.conflicting.join("・")}</span>}
                    {c.unknown.length > 0 && <span className="un">未入力: {c.unknown.join("・")}</span>}
                  </p>
                  <p className="note">鳴き声の例: {c.species.onomatopoeia.join(" / ")}</p>
                      <CatchButton speciesId={c.species.species_id} collection={collection} onCatch={onCatch} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {results.length === 0 && (
              <p className="hint">近い鳥が見つかりませんでした。入力を減らすか、別の特徴に変えてみてください。</p>
            )}
          </>
        )}
      </section>

      </>}

      <footer>
        <p>
          鳥のデータは一般的な図鑑知識に基づく暫定値で、地域の調査資料での確認は未実施です（試作版）。
        </p>
      </footer>
    </main>
  );
}
