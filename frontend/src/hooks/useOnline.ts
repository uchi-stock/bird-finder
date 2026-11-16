import { useEffect, useState } from "react";

function currentOnline(): boolean {
  // 未対応の環境では、常にオンライン扱いにする（案内を出さないだけで、動作は変えない）
  return typeof navigator === "undefined" || typeof navigator.onLine !== "boolean" ? true : navigator.onLine;
}

/** 端末がオンラインか。online / offline イベントで切り替わる */
export function useOnline(): boolean {
  const [online, setOnline] = useState(currentOnline);
  useEffect(() => {
    const update = () => setOnline(currentOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** イベントを待たずに、いまオンラインかを調べる（タップ時の判断用） */
export function isOnlineNow(): boolean {
  return currentOnline();
}
