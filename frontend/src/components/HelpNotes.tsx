import { useState } from "react";
import { createPortal } from "react-dom";

// 常時表示すると画面を圧迫する注意文言を、「ⓘ」ボタンで開くモーダルにまとめる
export const HELP_NOTES = [
  "候補は点数順の目安です。確率ではありません。",
  "鳥の画像をタップすると鳴き声を再生し、同時に拡大します。もう一度タップで停止します。",
  "現在地は、アプリを開いたときと「現在地から判定」を押したときだけ使います。座標は保存せず、地図情報（OpenStreetMap）への問い合わせにのみ送られます。",
  "鳥のデータは一般的な図鑑知識に基づく暫定値で、地域の調査資料での確認は未実施です（試作版）。",
];

export function HelpNotes() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="help-btn"
        aria-label="使い方と注意"
        onClick={() => setOpen(true)}
      >
        ⓘ
      </button>
      {open &&
        createPortal(
          <div
            className="help-modal"
            role="dialog"
            aria-label="使い方と注意"
            onClick={() => setOpen(false)}
          >
            <div className="help-box" onClick={(e) => e.stopPropagation()}>
              <h2>使い方と注意</h2>
              <ul>
                {HELP_NOTES.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <button className="help-close" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
