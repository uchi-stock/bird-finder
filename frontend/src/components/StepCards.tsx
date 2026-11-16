import { useRef, useState } from "react";
import { allowedBehaviors, allowedPlaces } from "../domain/choices";
import { HABITATS } from "../domain/habitat";
import { STEP_TITLES } from "../domain/labels";
import type { ObservationState } from "../hooks/useObservation";
import { BEHAVIORS, COLORS, HABITAT_EMOJI, PLACES, SIZES, TIMES, toggle } from "../options";
import { Emoji } from "./Emoji";

/** 条件を入力するカード（横スライド）と、現在位置・回答済みを示すドット */
export function StepCards({ o }: { o: ObservationState }) {
  const {
    sizeLevel, setSizeLevel, colors, setColors, behaviors, setBehaviors, place, selectPlace,
    date, setDate, useDate, setUseDate, habitats, setHabitats, time, setTime, voice, setVoice, noVoice, setNoVoice,
    locMsg, locBusy, locate, seen, stepDone,
  } = o;
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
  return (
    <>
          <div className="step-nav">
            <div className="dots">
              {STEP_TITLES.map((t, i) => (
                <button key={t} aria-label={`${i + 1}. ${t}`} className={`dot-step${i === stepIdx ? " cur" : ""}${stepDone[i] ? " done" : ""}`} onClick={() => goStep(i)} />
              ))}
            </div>
            <span className="step-title">
              {stepIdx + 1}/{STEP_TITLES.length} {STEP_TITLES[stepIdx]}{"\u3000"}← スライド →
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
                  <button key={h.v} className={habitats.includes(h.v) ? "chip on" : "chip"} aria-pressed={habitats.includes(h.v)} onClick={() => setHabitats(toggle(habitats, h.v))}>
                    <Emoji c={HABITAT_EMOJI[h.v]} />
                    {h.label}
                  </button>
                ))}
              </div>
              {locMsg && <p className="hint">{locMsg}</p>}
            </section>

            <section className="step">
              <h2>どこで見たか</h2>
              <div className="chips">
                {PLACES.filter((p) => allowedPlaces(habitats).includes(p.v)).map((p) => (
                  <button key={p.v} className={place === p.v ? "chip on" : "chip"} aria-pressed={place === p.v} onClick={() => selectPlace(place === p.v ? undefined : p.v)}>
                    <Emoji c={p.emoji} />
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="step">
              <h2>行動（複数可）</h2>
              <div className="chips">
                {BEHAVIORS.filter((b) => allowedBehaviors(place, habitats).includes(b.v)).map((b) => (
                  <button key={b.v} className={behaviors.includes(b.v) ? "chip on" : "chip"} aria-pressed={behaviors.includes(b.v)} onClick={() => setBehaviors(toggle(behaviors, b.v))}>
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
                  className={noVoice ? "chip on" : "chip"} aria-pressed={noVoice}
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
              {!seen && <p className="hint">姿が見えないので、不明として扱います。</p>}
              <div className="sizes" hidden={!seen}>
                {SIZES.map((s) => (
                  <button key={s.level} className={sizeLevel === s.level ? "chip on" : "chip"} aria-pressed={sizeLevel === s.level} onClick={() => setSizeLevel(sizeLevel === s.level ? undefined : s.level)}>
                    <Emoji c={s.emoji} />
                    {s.level}
                  </button>
                ))}
              </div>
              <p className="hint" hidden={!seen}>
                {sizeLevel ? `${SIZES[sizeLevel - 1].ref}くらい（${SIZES[sizeLevel - 1].cm}）` : "1（最小）〜7（最大）。もう一度タップで解除"}
              </p>
            </section>

            <section className="step">
              <h2>羽の色（複数可）</h2>
              {!seen && <p className="hint">姿が見えないので、不明として扱います。</p>}
              <div className="chips" hidden={!seen}>
                {COLORS.map((c) => (
                  <button key={c.v} className={colors.includes(c.v) ? "chip on" : "chip"} aria-pressed={colors.includes(c.v)} onClick={() => setColors(toggle(colors, c.v))}>
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
                  <button key={t.v} className={time === t.v ? "chip on" : "chip"} aria-pressed={time === t.v} onClick={() => setTime(time === t.v ? undefined : t.v)}>
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
    </>
  );
}
