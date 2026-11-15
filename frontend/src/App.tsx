import { useMemo, useState } from "react";
import speciesJson from "./data/species.json";
import { hasAnyInput, identify } from "./domain/scoring";
import type { Behavior, Candidate, Color, Observation, Place, Species } from "./domain/types";

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

export function App() {
  const [sizeLevel, setSizeLevel] = useState<number | undefined>();
  const [colors, setColors] = useState<Color[]>([]);
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [place, setPlace] = useState<Place | undefined>();
  const [date, setDate] = useState(todayStr());
  const [useDate, setUseDate] = useState(true);
  const [voice, setVoice] = useState("");
  const [showAll, setShowAll] = useState(false);

  const obs: Observation = useMemo(
    () => ({
      sizeLevel,
      colors,
      behaviors,
      place,
      month: useDate && date ? Number(date.split("-")[1]) : undefined,
      onomatopoeia: voice,
    }),
    [sizeLevel, colors, behaviors, place, date, useDate, voice],
  );
  const results = useMemo(() => identify(obs, SPECIES), [obs]);
  // 日付だけでは「何か入力した」とみなさない（初期値が入っているため）
  const inputForResults = hasAnyInput({ ...obs, month: undefined });
  const shown = showAll ? results : results.slice(0, 8);

  const reset = () => {
    setSizeLevel(undefined);
    setColors([]);
    setBehaviors([]);
    setPlace(undefined);
    setVoice("");
    setShowAll(false);
  };

  return (
    <main className="app">
      <h1>声しか知らない鳥を探す</h1>
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
              {shown.map((c) => (
                <li key={c.species.species_id}>
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
                </li>
              ))}
            </ol>
            {!showAll && results.length > 8 && (
              <button className="more" onClick={() => setShowAll(true)}>
                全{results.length}種を表示
              </button>
            )}
          </>
        )}
      </section>

      <footer>
        <p>
          鳥のデータは一般的な図鑑知識に基づく暫定値で、地域の調査資料での確認は未実施です（試作版）。
        </p>
      </footer>
    </main>
  );
}
