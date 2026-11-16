import { useEffect, useRef } from "react";

/**
 * モーダルの共通の振る舞い。
 * 開いたとき: モーダル内の最初のボタンへフォーカスを移す。
 * 閉じたとき: 開く前にフォーカスしていた要素へ戻す。
 * Escキーで閉じる。
 * 返す ref をモーダルの最も外側の要素に付ける。
 * フォーカスの閉じ込め（Tabの循環）は、主な利用がタッチのため行わない。
 */
export function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open]);
  return ref;
}
