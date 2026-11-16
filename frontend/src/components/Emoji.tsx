/** ボタンの絵文字（読み上げ対象外にするため、表示はEmojiコンポーネントを使う） */
export function Emoji({ c }: { c: string }) {
  return (
    <span className="emoji" aria-hidden="true">
      {c}
    </span>
  );
}
