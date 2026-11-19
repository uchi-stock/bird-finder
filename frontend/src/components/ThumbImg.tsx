import { useEffect, useRef, useState } from "react";
import { photoKey } from "../domain/photoKey";
import { cropStyle, subjectCrop, type Crop } from "../domain/subjectCrop";
import cropsJson from "../data/photoCrops.json";

// サムネイル画像。余白が多い画像は、被写体に寄せて、正方形で切り出して表示する（#148・#150）。
// 画像は加工・保存せず、切り出す範囲だけを使い、CSSで切り出す。範囲は、次の順に決める。
// 1. 保存した範囲（photoCrops.json。GitHub Actionsで、鳥を物体検出して作る。画像のファイル名がキー。nullは「切り出さない」）
// 2. 保存した範囲が無い画像は、読み込み後に、縮小した輝度から推定する（背景が無地の画像向けの予備）
// 計算できない場合（CORS・非対応環境）や、切り出さないほうがよい画像は、これまでの全体表示のまま
const stored = cropsJson as Record<string, Crop | null>;

/** 保存した切り出し範囲。保存が無い（未検出の）画像は、undefined */
function storedCrop(src: string): Crop | null | undefined {
  const key = photoKey(src);
  return key in stored ? stored[key] : undefined;
}

/** 計算に使う、縮小した画像の長辺（画素） */
const SAMPLE = 64;

// 画像のURLごとの計算結果（nullは、切り出さない）。同じ画像で、計算を繰り返さない
const cache = new Map<string, Crop | null>();

/** 読み込み済みの画像から、切り出し範囲を計算する。canvasを読めない（CORS等）ときは、null */
function measure(img: HTMLImageElement): Crop | null {
  try {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const scale = SAMPLE / Math.max(nw, nh);
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      const a = data[i * 4 + 3] / 255;
      const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      gray[i] = Math.round(lum * a + 255 * (1 - a)); // 透明な部分は、白として扱う
    }
    return subjectCrop(gray, w, h);
  } catch {
    return null;
  }
}

/** 切り出し範囲を決めて、返す。保存した範囲があれば、画像の読み込みを待たずに使い、無ければ、読み込み後に推定する */
function useThumbCrop(src: string) {
  const ref = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop | null>(() => storedCrop(src) ?? cache.get(src) ?? null);
  const compute = (img: HTMLImageElement) => {
    const fixed = storedCrop(src);
    if (fixed !== undefined) {
      setCrop(fixed); // 保存した範囲があれば、それを使う（nullは、切り出さない）
      return;
    }
    if (!cache.has(src)) cache.set(src, measure(img));
    setCrop(cache.get(src) ?? null);
  };
  // 読み込み済み（キャッシュから即時に表示された）画像は、onLoadが先に走っていることがあるため、ここでも計算する
  useEffect(() => {
    const fixed = storedCrop(src);
    if (fixed !== undefined) setCrop(fixed); // 画像の読み込みを待たずに、保存した範囲で切り出す
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) compute(img);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- srcが変わったときだけ計算する
  }, [src]);
  return { crop, ref, onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => compute(e.currentTarget) };
}

interface Props {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
}

/**
 * 常に<span><img/></span>の形で出す（切り出しの有無で要素が入れ替わり、画像が読み込み直されないため）。
 * 切り出さないときのspanは、レイアウトに影響しない（display: contents）
 */
export function ThumbImg({ src, alt, loading }: Props) {
  const { crop, ref, onLoad } = useThumbCrop(src);
  return (
    <span className={crop ? "thumb-sq" : "thumb-plain"}>
      <img ref={ref} src={src} alt={alt} loading={loading} crossOrigin="anonymous" onLoad={onLoad} style={crop ? cropStyle(crop) : undefined} />
    </span>
  );
}

/** 詳細の「飛ぶ姿」の画像。余白が多ければ、鳥に寄せた正方形で出す（#156）。切り出さない画像は、全体を出す */
export function FlightImg({ src, alt }: { src: string; alt: string }) {
  const { crop, ref, onLoad } = useThumbCrop(src);
  return (
    <span className={crop ? "lb-flight-sq" : "lb-flight-plain"}>
      <img ref={ref} src={src} alt={alt} loading="lazy" crossOrigin="anonymous" onLoad={onLoad} style={crop ? cropStyle(crop) : undefined} />
    </span>
  );
}
