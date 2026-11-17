import { lazy, Suspense, useState } from "react";
import { caughtCount } from "./domain/collection";
import { countWithoutLocation } from "./domain/sightings";
import { getCoords } from "./location";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration.jsx";
import { UpdateNotifier } from "./components/UpdateNotifier";
import { AppHeader } from "./components/AppHeader";
import { Emoji } from "./components/Emoji";
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

// タブの切り替えと、状態（条件・再生・図鑑）の結線だけを持つ
export function App() {
  const [tab, setTab] = useState<"search" | "dex" | "quiz" | "map">("search");
  const { collection, sightings, mapPoints, onCatch, shareSighting } = useCollection();
  const shared = useSharedSightings();
  const o = useObservation();
  const { now, onPlay, isActive } = useCallPlayer();
  const online = useOnline();

  return (
    <main className={tab === "dex" || tab === "quiz" ? "app" : "app fit"}>
      <ServiceWorkerRegistration swUrl={`${import.meta.env.BASE_URL}sw.js`} />
      <UpdateNotifier />
      <AppHeader />
      {!online && (
        <p className="offline-note" role="status">
          オフラインです。鳥の判定は使えます。写真・鳴き声・地図は表示できないことがあります。
        </p>
      )}
      {tab === "dex" ? (
        <Dex collection={collection} onCatch={onCatch} onShare={shareSighting} />
      ) : tab === "quiz" ? (
        <Quiz />
      ) : tab === "map" ? (
        <Suspense fallback={<p className="hint">地図を読み込み中…</p>}>
          <MapView points={mapPoints} speciesLabel={speciesLabel} withoutLocation={countWithoutLocation(sightings)} locate={getCoords} shared={shared} dummy={DUMMY_POINTS} />
        </Suspense>
      ) : (
        <>
          <StepCards o={o} />
          <ResultList results={o.results} inputForResults={o.inputForResults} flying={o.flying} reset={o.reset} now={now} onPlay={onPlay} isActive={isActive} collection={collection} onCatch={onCatch} onShare={shareSighting} />
        </>
      )}
      <nav className="tabbar" aria-label="画面の切り替え">
        <button className={tab === "search" ? "tab on" : "tab"} aria-current={tab === "search" ? "page" : undefined} onClick={() => setTab("search")}>
          <Emoji c="🔍" />
          探す
        </button>
        <button className={tab === "dex" ? "tab on" : "tab"} aria-current={tab === "dex" ? "page" : undefined} onClick={() => setTab("dex")}>
          <Emoji c="📖" />
          図鑑 {caughtCount(collection)}/{SPECIES.length}
        </button>
        <button className={tab === "quiz" ? "tab on" : "tab"} aria-current={tab === "quiz" ? "page" : undefined} onClick={() => setTab("quiz")}>
          <Emoji c="🎯" />
          クイズ
        </button>
        <button className={tab === "map" ? "tab on" : "tab"} aria-current={tab === "map" ? "page" : undefined} onClick={() => setTab("map")}>
          <Emoji c="🗺️" />
          地図
        </button>
      </nav>
    </main>
  );
}
