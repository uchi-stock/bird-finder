// 鳴き声の音源（Wikimedia Commons）の取得と再生。
// iOS Safariは、ユーザー操作の中で再生された<audio>要素でないと、非同期処理後のplay()を許可しない。
// そのため単一の<audio>要素（シングルトン）をタップの同期処理内で解錠し、以降はsrcを差し替えて再生する
// （dev-standards docs/ios-safari-audio-unlock-pattern.md）。

export interface CallAudio {
  src: string;
  pageUrl: string;
  title: string;
  credit?: string;
  license?: string;
}

interface Derivative {
  src?: string;
  type?: string;
}
interface CommonsPage {
  index?: number;
  title: string;
  videoinfo?: { url?: string; mime?: string; descriptionurl?: string; derivatives?: Derivative[]; extmetadata?: Record<string, { value?: string }> }[];
}
export type CommonsResponse = { query?: { pages?: Record<string, CommonsPage> } };

const normalize = (s: string) => s.toLowerCase().replace(/[-_.]+/g, " ");

/** タイトルが、学名（属名または種小名）を含むか */
function titleMatches(title: string, scientificName: string): boolean {
  const t = normalize(title);
  return scientificName
    .toLowerCase()
    .split(/\s+/)
    .some((tok) => tok.length >= 4 && t.includes(tok));
}

/** 再生に使うURL: iPhoneで再生できるMP3を優先する（Oggの元ファイルにはCommonsがMP3版を用意している） */
function playableSrc(info: NonNullable<CommonsPage["videoinfo"]>[number]): string | null {
  const mp3 = info.derivatives?.find((d) => d.type?.startsWith("audio/mpeg") && d.src);
  if (mp3?.src) return mp3.src;
  if (info.mime === "audio/mpeg" && info.url) return info.url;
  return null;
}

/**
 * 検索結果から音源を選ぶ。
 * strict=trueのときは、ファイル名に学名を含むものだけを採用する（別の鳥の音源を再生しないため）
 */
export function pickAudio(json: CommonsResponse, scientificName: string, strict: boolean): CallAudio | null {
  const pages = Object.values(json?.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const pg of pages) {
    const info = pg.videoinfo?.[0];
    if (!info || (strict && !titleMatches(pg.title, scientificName))) continue;
    const src = playableSrc(info);
    if (!src) continue;
    const meta = info.extmetadata ?? {};
    return {
      src,
      pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org/",
      title: pg.title.replace(/^File:/, ""),
      credit: (meta.Artist?.value ?? "").replace(/<[^>]*>/g, "").trim() || undefined,
      license: meta.LicenseShortName?.value,
    };
  }
  return null;
}

export function commonsAudioUrl(scientificName: string, mode: "category" | "text"): string {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "8",
    gsrsearch: mode === "category" ? `filetype:audio incategory:"${scientificName}"` : `filetype:audio "${scientificName}"`,
    prop: "videoinfo",
    viprop: "url|mime|derivatives|extmetadata|duration",
  });
  return `https://commons.wikimedia.org/w/api.php?${q.toString()}`;
}

async function search(scientificName: string, mode: "category" | "text"): Promise<CallAudio | null> {
  const res = await fetch(commonsAudioUrl(scientificName, mode));
  if (!res.ok) return null;
  return pickAudio(await res.json(), scientificName, mode === "text");
}

const audioCache = new Map<string, Promise<CallAudio | null>>();

/** 学名で音源を探す。まずカテゴリで探し、無ければ学名を含むファイル名に限って全文検索する。失敗・該当なしはnull */
export function fetchCallAudio(scientificName: string): Promise<CallAudio | null> {
  let p = audioCache.get(scientificName);
  if (!p) {
    p = (async () => (await search(scientificName, "category")) ?? (await search(scientificName, "text")))().catch(() => null);
    audioCache.set(scientificName, p);
  }
  return p;
}

// ---- 共有<audio>要素（iOS Safari対策） ----

const SILENT_AUDIO_DATA_URI = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let sharedAudio: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

/** タップ操作の同期処理内（awaitの前）で呼ぶ。共有<audio>を解錠する */
export function unlockAudio(): void {
  try {
    const a = getSharedAudio();
    a.src = SILENT_AUDIO_DATA_URI;
    a.play().catch(() => {});
  } catch {
    /* 非対応環境では何もしない */
  }
}

/** 再生する。終了時にonEndedを呼ぶ。前の再生は止める */
export async function playAudio(src: string, onEnded: () => void): Promise<void> {
  const a = getSharedAudio();
  a.pause();
  a.onended = onEnded;
  a.src = src;
  await a.play();
}

export function stopAudio(): void {
  if (!sharedAudio) return;
  sharedAudio.onended = null;
  sharedAudio.pause();
}

/** テスト用: 共有要素を作り直す */
export function resetAudioForTest(): void {
  sharedAudio = null;
}
