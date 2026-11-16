import { useEffect, useState, type ReactNode } from "react";
import { largeImageUrl } from "../domain/habitat";
import { useFlightPhoto, usePhoto } from "../photo";
import { useModal } from "../hooks/useModal";
import { Emoji } from "./Emoji";

interface PhotoProps {
  name: string;
  scientificName?: string;
  flying?: boolean;
  /** 拡大表示の状態を親が持つ場合に指定する（省略時は自分で持つ） */
  zoomed?: boolean;
  onZoomChange?: (zoomed: boolean) => void;
  /** 拡大表示に添える内容（再生中の表示など） */
  caption?: ReactNode;
  /** 写真が無いとき、枠に名前を出す（検索結果で見分けられるように） */
  showNameWhenEmpty?: boolean;
}

export function Photo({ name, scientificName, flying = false, zoomed, onZoomChange, caption, showNameWhenEmpty = false }: PhotoProps) {
  const standing = usePhoto(name);
  // 飛んでいる状況なら飛翔の画像を探す。見つからなければ通常の画像（多くは止まっている・立っている姿）
  const flight = useFlightPhoto(scientificName ?? "", flying && Boolean(scientificName));
  const photo = flying && flight ? flight : standing;
  const [innerOpen, setInnerOpen] = useState(false);
  const open = zoomed ?? innerOpen;
  const setOpen = (v: boolean) => (onZoomChange ? onZoomChange(v) : setInnerOpen(v));
  const [largeSrc, setLargeSrc] = useState("");
  const [largeLoaded, setLargeLoaded] = useState(false);
  useEffect(() => {
    if (photo) {
      setLargeSrc(photo.flight ? photo.thumbnail : largeImageUrl(photo.thumbnail));
      setLargeLoaded(false);
    }
  }, [photo]);
  const modalRef = useModal(open, () => setOpen(false));
  // 拡大表示（鳥の詳細）。写真が無い鳥でも開く（捕まえる・再生中の表示を載せるため）
  const lightbox = open && (
    <div
      className="lightbox"
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${name}の詳細`}
      onClick={(e) => {
        e.stopPropagation();
        // 拡大表示内のボタン・リンクでは閉じない。背景をタップすると閉じる
        if (!(e.target as HTMLElement).closest("button, a")) setOpen(false);
      }}
    >
      <div className="lightbox-inner">
        <button type="button" className="lb-close" onClick={() => setOpen(false)}>
          閉じる
        </button>
      {photo ? (
        // 読み込み済みの小さい版を、開いた瞬間に拡大して出す。大きい版は、読み込み完了後に上へ重ねて切り替える
        <div className="lb-photo">
          <img className="lb-thumb" src={photo.thumbnail} alt={name} />
          <img
            className={largeLoaded ? "lb-large on" : "lb-large"}
            src={largeSrc}
            alt=""
            aria-hidden="true"
            onLoad={() => setLargeLoaded(true)}
            onError={() => setLargeSrc(photo.thumbnail)}
          />
        </div>
      ) : (
        <div className="photo-empty-large">写真なし</div>
      )}
      <strong className="lightbox-name">{name}</strong>
      {caption}
      {photo && (
        <a href={photo.pageUrl} target="_blank" rel="noreferrer">
          {photo.flight
            ? `出典: Wikimedia Commons（撮影: ${photo.credit ?? "不明"} ／ ${photo.license ?? "ライセンスはリンク先を参照"}）`
            : `出典: Wikipedia「${name}」（画像の著作者・ライセンスはリンク先を参照）`}
        </a>
      )}
      </div>
    </div>
  );
  if (!photo) {
    return (
      <>
        <div className="photo empty">
          <span>写真なし</span>
          {showNameWhenEmpty && <strong className="empty-name">{name}</strong>}
        </div>
        {lightbox}
      </>
    );
  }
  return (
    <>
      <div className="photo">
        <img src={photo.thumbnail} alt={name} loading="lazy" />
        {photo.flight && <span className="flight-badge">飛翔</span>}
        <button
          type="button"
          className="zoom"
          aria-label={`${name}の写真を拡大`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Emoji c="🔍" />
        </button>
      </div>
      {lightbox}
    </>
  );
}
