import { useEffect, useRef, useState } from "react";
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
    habitats, setHabitats, time, setTime, voice, setVoice, noVoice, setNoVoice,
    locMsg, locBusy, locate, autoLocated, visibleSteps, stepDone,
  } = o;
  const stepsRef = useRef<HTMLDivElement>(null);
  const [rawIdx, setStepIdx] = useState(0);
  const moved = useRef(false);
  // 出すカードが減ったとき（見えないを選んだ等）も、現在位置が枚数を超えないようにする
  const stepIdx = Math.min(rawIdx, visibleSteps.length - 1);
  const onStepsScroll = () => {
    const el = stepsRef.current;
    if (!el) return;
    if (el.scrollLeft > 0 && !autoLocated) moved.current = true;
    const w = el.scrollWidth / visibleSteps.length;
    if (!(w > 0)) return;
    setStepIdx(Math.min(visibleSteps.length - 1, Math.max(0, Math.round(el.scrollLeft / w))));
  };
  const goStep = (i: number) => {
    const el = stepsRef.current;
    el?.scrollTo?.({ left: i * (el.scrollWidth / visibleSteps.length), behavior: "smooth" });
    setStepIdx(i);
  };
  // 現在地から環境を判定できたら、環境（1枚目）と時間帯（2枚目。自動で入る）は答え済みなので、3枚目から始める。
  // 利用者が先にスライドしていたら、動かさない
  useEffect(() => {
    if (autoLocated && !moved.current) goStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 判定できた瞬間にだけ動かす
  }, [autoLocated]);
  const show = (step: number) => visibleSteps.includes(step);
  return (
    <>
          <div className="step-nav">
            <div className="dots">
              {visibleSteps.map((step, pos) => (
                <button key={step} aria-label={`${pos + 1}. ${STEP_TITLES[step]}`} className={`dot-step${pos === stepIdx ? " cur" : ""}${stepDone[step] ? " done" : ""}`} onClick={() => goStep(pos)} />
              ))}
            </div>
            <span className="step-title">
              {stepIdx + 1}/{visibleSteps.length} {STEP_TITLES[visibleSteps[stepIdx] ?? 0]}{"\u3000"}← スライド →
            </span>
          </div>
          <div className="steps" ref={stepsRef} onScroll={onStepsScroll}>
            <section className="step" hidden={!show(0)}>
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

            <section className="step" hidden={!show(6)}>
              <h2>時間帯</h2>
              <div className="chips">
                {TIMES.map((t) => (
                  <button key={t.v} className={time === t.v ? "chip on" : "chip"} aria-pressed={time === t.v} onClick={() => setTime(time === t.v ? undefined : t.v)}>
                    <Emoji c={t.emoji} />
                    {t.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="step" hidden={!show(1)}>
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

            <section className="step" hidden={!show(2)}>
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

            <section className="step" hidden={!show(4)}>
              <h2>大きさ</h2>
              <div className="sizes">
                {SIZES.map((s) => (
                  <button key={s.level} className={sizeLevel === s.level ? "chip on" : "chip"} aria-pressed={sizeLevel === s.level} onClick={() => setSizeLevel(sizeLevel === s.level ? undefined : s.level)}>
                    <Emoji c={s.emoji} />
                    {s.level}
                  </button>
                ))}
              </div>
              <p className="hint">
                {sizeLevel ? `${SIZES[sizeLevel - 1].ref}くらい（${SIZES[sizeLevel - 1].cm}）` : "1（最小）〜7（最大）。もう一度タップで解除"}
              </p>
            </section>

            <section className="step" hidden={!show(5)}>
              <h2>羽の色（複数可）</h2>
              <div className="chips">
                {COLORS.map((c) => (
                  <button key={c.v} className={colors.includes(c.v) ? "chip on" : "chip"} aria-pressed={colors.includes(c.v)} onClick={() => setColors(toggle(colors, c.v))}>
                    <span className="dot" style={{ background: c.css }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="step" hidden={!show(3)}>
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
          </div>
    </>
  );
}
