import { useEffect, useState } from "react";

// shared/pwa/UpdateNotifier.jsx（Bootstrap向けクラス名）を、Bootstrap未導入のこのプロダクト向けに
// 調整したコピー。既存バージョンからの切り替わり時だけ再読み込みを促す（強制リロードはしない）
export function UpdateNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);
    const onChange = () => {
      if (hadControllerAtLoad) setUpdateAvailable(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);

  if (!updateAvailable) return null;
  return (
    <div className="update-notifier" role="alert">
      <span>新しいバージョンがあります</span>
      <button type="button" onClick={() => window.location.reload()}>
        更新する
      </button>
    </div>
  );
}
