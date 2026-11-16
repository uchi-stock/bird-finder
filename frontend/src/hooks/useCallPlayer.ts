import { useRef, useState } from "react";
import { fetchCallAudio, playAudio, stopAudio, unlockAudio, type CallAudio } from "../callAudio";
import type { Species } from "../domain/types";
import { isOnlineNow } from "./useOnline";

export type NowPlaying = { id: string; name: string; status: "loading" | "playing" | "none" | "error" | "offline"; info?: CallAudio };

/** 鳴き声の再生状態。候補のタップで再生し、同じ鳥をもう一度タップすると停止する */
export function useCallPlayer() {
  const [now, setNow] = useState<NowPlaying | null>(null);
  // 別の鳥をタップしたとき、古い取得結果を捨てるための番号（描画に使わないのでrefで持つ）
  const playToken = useRef(0);
  // iOS対策: 解錠（unlockAudio）は、タップの同期処理内（最初のawaitより前）で行う。この順序を変えないこと
  const onPlay = async (sp: Species) => {
    if (now?.id === sp.species_id && (now.status === "playing" || now.status === "loading")) {
      playToken.current++;
      stopAudio();
      setNow(null);
      return;
    }
    unlockAudio();
    const token = ++playToken.current;
    if (!isOnlineNow()) {
      setNow({ id: sp.species_id, name: sp.name_ja, status: "offline" });
      return;
    }
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

  /** その鳥が再生中（または音源を探している最中）か。再生中にもう一度タップされたら停止になる */
  const isActive = (speciesId: string) => now?.id === speciesId && (now.status === "playing" || now.status === "loading");

  return { now, onPlay, isActive };
}
