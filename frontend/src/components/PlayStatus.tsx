import type { NowPlaying } from "../hooks/useCallPlayer";

export function PlayStatus({ now }: { now: NowPlaying }) {
  if (now.status === "loading") return <p className="hint play-status">🔍 {now.name}の音源を探しています…</p>;
  if (now.status === "none") return <p className="hint play-status">🔇 {now.name}の音源は見つかりませんでした</p>;
  if (now.status === "error") return <p className="hint play-status">⚠️ {now.name}の鳴き声を再生できませんでした（音量・マナーモードを確認してください）</p>;
  const i = now.info!;
  return (
    <p className="hint play-status">
      🔊 {now.name}（もう一度タップで停止） ・ 音源: {i.credit ?? "不明"} ／ {i.license ?? "ライセンスはリンク先"}{" "}
      <a href={i.pageUrl} target="_blank" rel="noreferrer">
        出典(Commons)
      </a>
    </p>
  );
}
