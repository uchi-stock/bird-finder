// 鳴き声の音源（Wikimedia Commons）の取得と再生。
// iOS Safariは、ユーザー操作の中で再生された<audio>要素でないと、非同期処理後のplay()を許可しない。
// そのため単一の<audio>要素（シングルトン）をタップの同期処理内で解錠し、以降はsrcを差し替えて再生する
// （dev-standards docs/ios-safari-audio-unlock-pattern.md）。

import curatedJson from "./data/calls.json";

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
  /** 所属するカテゴリ（例「Category:Operas by Leoš Janáček」）。音楽作品など、鳥の録音でないものを見分ける手がかり */
  categories?: { title: string }[];
  videoinfo?: { duration?: number; url?: string; mime?: string; descriptionurl?: string; derivatives?: Derivative[]; extmetadata?: Record<string, { value?: string }> }[];
}
export type CommonsResponse = { query?: { pages?: Record<string, CommonsPage> } };

// 選び直した音源（鳥の学名をキーにする。写真の選び直し photos.json と同じ考え方）。あれば、検索より優先し、通信しない。
// 検索で、合唱・環境音など、単独の鳴き声でない音源が選ばれる鳥の音源を、確認したうえで固定する
const curated = curatedJson as Record<string, CallAudio>;

// 単独の鳴き声でない録音らしいファイル（合唱・群れ・環境音）の手がかり。ファイル名と説明文で見る
// 人が鳥の名前を発音した録音（例: ドイツ語の「Silberreiher」を読み上げたファイル）も、Commonsの鳥のカテゴリに多く入っている
const NOT_SOLO = /chorus|choir|dawn|flock|colony|ambient|ambience|soundscape|atmosphere|background|ensemble|habitat|pronunciation|prononc|aussprache|pronunciaci|合唱|群れ|環境音|発音/i;
// 音楽作品・合唱など、鳥の録音でないものの手がかり（Commonsでは、鳥の名前を題にした音楽作品が、学名のカテゴリに入っていることがある。例: ヤナーチェクのオペラ「野鴨」）
const NOT_BIRD_CATEGORY = /music|opera|orchestra|symphon|compos|choir|chorus|choral|singer|vocal ensemble|ambient|soundscape|pronunciation/i;
// これより長い録音は、環境音などの可能性が高い（秒）
const LONG_SECONDS = 180;

/** 単独の鳴き声らしくない録音か。該当しても使えなくはないため、除外はせず、後回しにする */
function suspicious(pg: CommonsPage, info: NonNullable<CommonsPage["videoinfo"]>[number]): boolean {
  const desc = (info.extmetadata?.ImageDescription?.value ?? "").replace(/<[^>]*>/g, " ");
  const cats = (pg.categories ?? []).map((c) => c.title).join(" ");
  return NOT_SOLO.test(`${pg.title} ${desc}`) || NOT_BIRD_CATEGORY.test(cats) || (info.duration ?? 0) > LONG_SECONDS;
}

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
 * strict=trueのときは、ファイル名に学名を含むものだけを採用する（別の鳥の音源を再生しないため）。
 * 合唱・環境音・音楽・人の発音らしい録音は、後回しにする（単独の鳴き声がほかにあれば、そちらを選ぶ）。
 * allowSuspicious=falseのときは、後回しにする録音を、採用しない（ほかの検索を先に試すため）
 */
export function pickAudio(json: CommonsResponse, scientificName: string, strict: boolean, allowSuspicious = true): CallAudio | null {
  const pages = Object.values(json?.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const usable = pages.flatMap((pg) => {
    const info = pg.videoinfo?.[0];
    if (!info || (strict && !titleMatches(pg.title, scientificName))) return [];
    const src = playableSrc(info);
    if (!src) return [];
    const bad = suspicious(pg, info);
    return !bad || allowSuspicious ? [{ pg, info, src, bad }] : [];
  });
  // 単独らしい録音を先に（同じ区分の中では、検索の順位のまま）
  usable.sort((a, b) => Number(a.bad) - Number(b.bad));
  for (const { pg, info, src } of usable.slice(0, 1)) {
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
    prop: "videoinfo|categories",
    cllimit: "max",
    viprop: "url|mime|derivatives|extmetadata|duration",
  });
  return `https://commons.wikimedia.org/w/api.php?${q.toString()}`;
}

async function search(scientificName: string, mode: "category" | "text", allowSuspicious: boolean): Promise<CallAudio | null> {
  const res = await fetch(commonsAudioUrl(scientificName, mode));
  if (!res.ok) return null;
  return pickAudio(await res.json(), scientificName, mode === "text", allowSuspicious);
}

const audioCache = new Map<string, Promise<CallAudio | null>>();

/**
 * 学名で音源を探す。まずカテゴリで探し、無ければ学名を含むファイル名に限って全文検索する。失敗・該当なしはnull。
 * 学名のカテゴリには、音楽作品・人の発音の録音なども入っているため、まず「単独の鳴き声らしい」録音だけで、
 * カテゴリ → 全文検索の順に探す。どちらにも無いときだけ、後回しにした録音（疑わしいもの）を使う
 */
export function fetchCallAudio(scientificName: string): Promise<CallAudio | null> {
  const fixed = curated[scientificName];
  if (fixed?.src) return Promise.resolve(fixed); // 選び直した音源があれば、通信しない
  let p = audioCache.get(scientificName);
  if (!p) {
    p = (async () =>
      (await search(scientificName, "category", false)) ??
      (await search(scientificName, "text", false)) ??
      (await search(scientificName, "category", true)) ??
      (await search(scientificName, "text", true)))().catch(() => null);
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
