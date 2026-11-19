// 画像のURLから、画像のファイル名を取り出す（サイズ違いのURLでも同じキーになる）。
// 例: .../thumb/5/5e/Name.jpg/330px-Name.jpg → "Name.jpg"。切り出し範囲（割合）は、サイズによらないため、このキーで引く

/** Wikimediaのサムネイル（.../thumb/x/xy/ファイル名/サイズ-ファイル名）・元画像（.../x/xy/ファイル名）から、ファイル名を返す */
export function photoKey(url: string): string {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//);
    const name = m ? m[1] : (path.split("/").pop() ?? "");
    return decodeURIComponent(name);
  } catch {
    return url;
  }
}
