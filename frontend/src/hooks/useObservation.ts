import { useEffect, useMemo, useRef, useState } from "react";
import { allowedBehaviors, allowedPlaces, behaviorsAfterPlaceChange } from "../domain/choices";
import { hasAnyInput, identify, pickTop } from "../domain/scoring";
import { timeSlotFromHour } from "../domain/time";
import type { Behavior, Color, Habitat, Observation, Place, TimeSlot } from "../domain/types";
import { detectHabitats } from "../location";
import { SPECIES, todayStr } from "../options";

/** 条件の入力一式と、前の回答による絞り込み（選べなくなった選択の自動解除）、候補の計算 */
export function useObservation() {
  const [sizeLevel, setSizeLevel] = useState<number | undefined>();
  const [colors, setColors] = useState<Color[]>([]);
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [place, setPlace] = useState<Place | undefined>();
  const [date, setDate] = useState(todayStr());
  const [useDate, setUseDate] = useState(true);
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

  const stepDone = [habitats.length > 0, place !== undefined, behaviors.length > 0, voice !== "" || noVoice, sizeLevel !== undefined, colors.length > 0, time !== undefined];
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

  return {
    sizeLevel, setSizeLevel, colors, setColors, behaviors, setBehaviors, place, selectPlace,
    date, setDate, useDate, setUseDate, habitats, setHabitats, time, setTime, voice, setVoice, noVoice, setNoVoice,
    locMsg, locBusy, locate, results, inputForResults, stepDone, flying, reset,
  };
}

export type ObservationState = ReturnType<typeof useObservation>;
