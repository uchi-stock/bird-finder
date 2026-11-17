import { createPortal } from "react-dom";
import { useModal } from "../hooks/useModal";

// 常時表示すると画面を圧迫する注意文言を、「ⓘ」ボタンで開くモーダルにまとめる
export const HELP_NOTES = [
  "候補は点数順の目安です。確率ではありません。",
  "鳥の画像をタップすると鳴き声を再生し、同時に拡大します。もう一度タップで停止します。",
  "現在地は、アプリを開いたときと「現在地から判定」を押したときだけ使います。座標は保存せず、地図情報（OpenStreetMap）への問い合わせにのみ送られます。",
  "現在地から判定した周辺の環境は、違う場合はタップで修正できます。",
  "周辺の環境を選ぶと、「どこで見たか」はその環境にある場所だけになります。",
  "「空」を選ぶと「飛ぶ」、「見えない（声だけ）」を選ぶと「鳴く・歌う」が自動で選ばれます。「見えない」のときは、大きさと羽の色は不明として扱います。",
  "「みんなに共有」は、捕まえるときに選んだ場合だけ送ります。位置は約1kmにぼかし、自宅の周辺（約2km）は共有しません。あとから取り消せず、記録は期限なく保存されます。",
  "鳥のデータは一般的な図鑑知識に基づく暫定値で、地域の調査資料での確認は未実施です（試作版）。",
];

/** 使い方と注意のモーダル。開閉は、呼び出し側（ヘッダーのメニュー）が持つ */
export function HelpNotes({ open, onClose }: { open: boolean; onClose: () => void }) {
  const modalRef = useModal(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="help-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label="使い方と注意" onClick={onClose}>
      <div className="help-box" onClick={(e) => e.stopPropagation()}>
        <h2>使い方と注意</h2>
        <ul>
          {HELP_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <button className="help-close" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>,
    document.body,
  );
}
