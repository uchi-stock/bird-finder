import type { Collection } from "../domain/collection";
import type { Species } from "../domain/types";
import { useInView } from "../hooks/useInView";
import { ABUNDANCE_LABEL, COLORS, CONFIDENCE_LABEL, SIZES, SPECIES } from "../options";
import { CatchButton } from "./CatchButton";
import { Photo } from "./Photo";

// 全種の一覧（デバッグ・図鑑用）。各行の頭に鳥の画像を出す。画像は、画面に入った行だけ取得する

const SORTED = [...SPECIES].sort((a, b) => a.name_ja.localeCompare(b.name_ja, "ja"));
const colorLabel = (c: string) => COLORS.find((x) => x.v === c)?.label ?? c;

interface RowProps {
  species: Species;
  collection: Collection;
  onCatch: (id: string) => { isNew: boolean; count: number };
  onShare: (id: string) => Promise<string>;
}

function Row({ species: s, collection, onCatch, onShare }: RowProps) {
  const { ref, seen } = useInView<HTMLLIElement>();
  const caught = collection[s.species_id];
  const size = SIZES[s.size_level - 1];
  return (
    <li ref={ref} className="sp-row">
      <div className="sp-photo">
        {seen ? (
          <Photo
            name={s.name_ja}
            scientificName={s.scientific_name}
            showNameWhenEmpty
            caption={
              <>
                <p className="note">{s.note}</p>
                <p className="note">鳴き声: {s.onomatopoeia.join(" / ") || "聞こえない"}</p>
                <CatchButton speciesId={s.species_id} collection={collection} onCatch={onCatch} onShare={onShare} />
              </>
            }
          />
        ) : (
          <div className="photo empty" aria-hidden="true" />
        )}
      </div>
      <div className="sp-info">
        <strong>
          {s.name_ja}
          {caught && (
            <span className="caught" role="img" aria-label="捕獲済み">
              ✅
            </span>
          )}
        </strong>
        <span className="sp-sci">{s.scientific_name}</span>
        <span className="sp-meta">
          大きさ {s.size_level}（{size?.ref}くらい）・{s.colors.map(colorLabel).join("・")}
        </span>
        <span className="sp-meta">
          出現: {ABUNDANCE_LABEL[s.abundance]}・データ: {CONFIDENCE_LABEL[s.confidence] ?? s.confidence}
        </span>
      </div>
    </li>
  );
}

export function SpeciesList({ collection, onCatch, onShare }: Omit<RowProps, "species">) {
  return (
    <ul className="sp-list" aria-label="全種の一覧">
      {SORTED.map((s) => (
        <Row key={s.species_id} species={s} collection={collection} onCatch={onCatch} onShare={onShare} />
      ))}
    </ul>
  );
}
