import { useState } from "react";
import { getCoords } from "../location";
import { clearHome, loadHome, saveHome } from "../storage";
import type { LatLon } from "../domain/privacy";

/** 自宅の登録（共有から除外する場所）。登録した場所は、この端末の中にだけ保存し、送信しない */
export function PrivacySettings() {
  const [home, setHome] = useState<LatLon | null>(loadHome);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const register = async () => {
    setBusy(true);
    setMsg("");
    try {
      const p = await getCoords();
      if (!saveHome(p)) {
        setMsg("この端末では保存できませんでした");
        return;
      }
      setHome(p);
      setMsg("現在地を自宅として登録しました");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "現在地を取得できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    clearHome();
    setHome(null);
    setMsg("自宅の登録を削除しました");
  };

  return (
    <section className="privacy">
      <h2>
        <span className="emoji" aria-hidden="true">
          🏠
        </span>
        自宅の登録（共有から除外）
      </h2>
      <p className="hint">
        自宅の周辺（約2km以内）で見つけた鳥は、みんなへの共有から自動で除外されます。登録した場所は、この端末の中にだけ保存し、送信しません。共有する位置も、端末の中で約1km四方にぼかしてからずらして送ります。
      </p>
      {home ? (
        <div className="row">
          <span className="hint">自宅: 登録済み</span>
          <button type="button" className="chip" onClick={remove}>
            登録を削除
          </button>
        </div>
      ) : (
        <button type="button" className="chip" onClick={register} disabled={busy}>
          <span className="emoji" aria-hidden="true">
            📍
          </span>
          {busy ? "取得中…" : "現在地を自宅として登録"}
        </button>
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}
