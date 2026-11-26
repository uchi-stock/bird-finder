import { lazy, Suspense, useState } from "react";
import { caughtCount } from "./domain/collection";
import { countWithoutLocation } from "./domain/sightings";
import { getCoords } from "./location";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration.jsx";
import { UpdateNotifier } from "./components/UpdateNotifier";
import { AppHeader, type Tab } from "./components/AppHeader";
import { Battle } from "./components/Battle";
import { Dex } from "./components/Dex";
import { Quiz } from "./components/Quiz";
import { StepCards } from "./components/StepCards";
import { ResultList } from "./components/ResultList";
import { useCallPlayer } from "./hooks/useCallPlayer";
import { useCollection } from "./hooks/useCollection";
import { useObservation } from "./hooks/useObservation";
import { useSharedSightings } from "./hooks/useSharedSightings";
import { useOnline } from "./hooks/useOnline";
import { SPECIES, speciesLabel } from "./options";
import { buildDummyPoints } from "./domain/dummySpots";

// バトル試作用のダミー（実際の観察ではない）。決め方は固定なので、起動時に1回だけ作る
const DUMMY_POINTS = buildDummyPoints(SPECIES);

// 地図は大きいので、地図タブを開いたときに読み込む
const MapView = lazy(() => import("./components/MapView"));

// 画面（探す・図鑑・クイズ・地図）の切り替えと、状態（条件・再生・図鑑）の結線だけを持つ。画面の移動は、ヘッダーのメニューから行う
export function App() {
  const [tab, setTab] = useState<Tab>("search");
  // バトル中の相手（ダミー）の種ID。地図のダミーのピンから始まる（#221）
  const [battleOpp, setBattleOpp] = useState<string | null>(null);
  const { collection, sightings, mapPoints, onCatch, shareSighting } = useCollection();
  const shared = useSharedSightings();
  const o = useObservation();
  const { now, onPlay, isActive, stop } = useCallPlayer();
  const online = useOnline();

  return (
    <main className={tab === "dex" || tab === "quiz" || battleOpp ? "app" : "app fit"}>
      <ServiceWorkerRegistration swUrl={`${import.meta.env.BASE_URL}sw.js`} />
      <UpdateNotifier />
      <AppHeader tab={tab} onTab={(t) => { setBattleOpp(null); setTab(t); }} caught={caughtCount(collection)} total={SPECIES.length} />
      {!online && (
        <p className="offline-note" role="status">
          オフラインです。鳥の判定は使えます。写真・鳴き声・地図は表示できないことがあります。
        </p>
      )}
      {battleOpp ? (
        <Battle opponentId={battleOpp} collection={collection} onBack={() => setBattleOpp(null)} />
      ) : tab === "dex" ? (
        <Dex collection={collection} now={now} onPlay={onPlay} onStop={stop} isActive={isActive} />
      ) : tab === "quiz" ? (
        <Quiz collection={collection} onCatch={onCatch} onShare={shareSighting} />
      ) : tab === "map" ? (
        <Suspense fallback={<p className="hint">地図を読み込み中…</p>}>
          <MapView points={mapPoints} speciesLabel={speciesLabel} withoutLocation={countWithoutLocation(sightings)} locate={getCoords} shared={shared} dummy={DUMMY_POINTS} onBattle={setBattleOpp} />
        </Suspense>
      ) : (
        <>
          <StepCards o={o} />
          <ResultList results={o.results} inputForResults={o.inputForResults} flying={o.flying} reset={o.reset} now={now} onPlay={onPlay} onStop={stop} isActive={isActive} collection={collection} onCatch={onCatch} onShare={shareSighting} />
        </>
      )}
    </main>
  );
}
