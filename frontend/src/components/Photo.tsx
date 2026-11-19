import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { largeImageUrl } from "../domain/habitat";
import { retryPhoto, useFlightPhoto, usePhoto, usePhotoFailed } from "../photo";
import { useModal } from "../hooks/useModal";
import { Emoji } from "./Emoji";
import { SPECIES } from "../options";
import { ThumbImg } from "./ThumbImg";

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

/** 1枚目（ベース）の姿の名前。水に浮かぶ鳥（鳥のデータの行動に「泳ぐ」がある）は「浮かぶ姿」、それ以外は「立ち姿」 */
export function poseLabel(scientificName?: string): string {
  const sp = scientificName ? SPECIES.find((s) => s.scientific_name === scientificName) : undefined;
  return sp?.behaviors.includes("swimming") ? "浮かぶ姿" : "立ち姿";
}

export function Photo({ name, scientificName, flying = false, zoomed, onZoomChange, caption, showNameWhenEmpty = false }: PhotoProps) {
  const standing = usePhoto(name);
  const failed = usePhotoFailed(name);
  // 飛んでいる状況なら飛翔の画像を探す。見つからなければ通常の画像（多くは止まっている・立っている姿）
  // 詳細（拡大表示）には、立ち姿（水鳥は浮かぶ姿）と飛ぶ姿の2枚を出すため、詳細を開いたときにも飛翔の画像を探す（一覧では探さない）
  const [innerOpen, setInnerOpen] = useState(false);
  const open = zoomed ?? innerOpen;
  const flight = useFlightPhoto(scientificName ?? "", (flying || open) && Boolean(scientificName));
  const photo = flying && flight ? flight : standing;
  // 詳細の1枚目（ベース）は、常に立ち姿・浮かぶ姿。飛んでいる状況のサムネイルが飛翔の画像でも、詳細は変えない
  const base = standing;
  const pose = poseLabel(scientificName);
  const setOpen = (v: boolean) => (onZoomChange ? onZoomChange(v) : setInnerOpen(v));
  const [largeSrc, setLargeSrc] = useState("");
  const [largeLoaded, setLargeLoaded] = useState(false);
  useEffect(() => {
    if (base) {
      // 飛翔画像・選び直した写真は、すでに大きい版（500px）なので、そのまま使う
      setLargeSrc(base.flight || base.curated ? base.thumbnail : largeImageUrl(base.thumbnail));
      setLargeLoaded(false);
    }
  }, [base]);
  const modalRef = useModal(open, () => setOpen(false));
  // 拡大表示（鳥の詳細）。写真が無い鳥でも開く（捕まえる・再生中の表示を載せるため）。
  // モーダルとして画面全体に出すため、描画先は、一覧の行ではなくdocument.body（行の中だと、
  // 一覧の行の描画範囲（content-visibility）で見切れる）
  const lightbox = open && typeof document !== "undefined" && createPortal(
    <div
      className="lightbox"
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${name}の詳細`}
      onClick={(e) => {
        e.stopPropagation();
        // 拡大表示内のボタン・リンク・入力（共有のチェック等）では閉じない。背景をタップすると閉じる
        if (!(e.target as HTMLElement).closest("button, a, input, label")) setOpen(false);
      }}
    >
      <div className="lightbox-inner">
        <button type="button" className="lb-close" onClick={() => setOpen(false)}>
          閉じる
        </button>
      <span className="lb-pose">{pose}</span>
      {/* 捕まえる演出のボールは、この枠（画像の位置）に重ねて出す（CatchButtonが入れる） */}
      <div className="lb-stage">
      {base ? (
        // 読み込み済みの小さい版を、開いた瞬間に拡大して出す。大きい版は、読み込み完了後に上へ重ねて切り替える
        <div className="lb-photo">
          <img className="lb-thumb" src={base.thumbnail} alt={name} crossOrigin="anonymous" />
          <img
            className={largeLoaded ? "lb-large on" : "lb-large"}
            crossOrigin="anonymous"
            src={largeSrc}
            alt=""
            aria-hidden="true"
            onLoad={() => setLargeLoaded(true)}
            onError={() => setLargeSrc(base.thumbnail)}
          />
        </div>
      ) : (
        <div className="photo-empty-large">写真なし</div>
      )}
      </div>
      {/* 2枚目: 飛ぶ姿。見つからない鳥は、出さない */}
      {flight && (
        <figure className="lb-flight">
          <span className="lb-pose">飛ぶ姿</span>
          <img src={flight.thumbnail} alt={`${name}の飛ぶ姿`} loading="lazy" crossOrigin="anonymous" />
          <a href={flight.pageUrl} target="_blank" rel="noreferrer">
            {`出典: Wikimedia Commons（撮影: ${flight.credit ?? "不明"} ／ ${flight.license ?? "ライセンスはリンク先を参照"}）`}
          </a>
        </figure>
      )}
      <strong className="lightbox-name">{name}</strong>
      {caption}
      {base && (
        <a href={base.pageUrl} target="_blank" rel="noreferrer">
          {base.flight || base.curated
            ? `出典: Wikimedia Commons（撮影: ${base.credit ?? "不明"} ／ ${base.license ?? "ライセンスはリンク先を参照"}）`
            : `出典: Wikipedia「${name}」（画像の著作者・ライセンスはリンク先を参照）`}
        </a>
      )}
      </div>
    </div>,
    document.body,
  );
  if (!photo) {
    return (
      <>
        <div className="photo empty">
          <span>写真なし</span>
          {failed && (
            <button type="button" className="photo-retry" onClick={() => retryPhoto(name)}>
              再読み込み
            </button>
          )}
          {showNameWhenEmpty && <strong className="empty-name">{name}</strong>}
        </div>
        {lightbox}
      </>
    );
  }
  return (
    <>
      <div className="photo">
        <ThumbImg src={photo.thumbnail} alt={name} loading="lazy" />
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
