import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "../hooks/useModal";
import formatBuildTime from "../shared/formatBuildTime.js";
import { HelpNotes } from "./HelpNotes";
import { PrivacySettings } from "./PrivacySettings";

/**
 * 全画面で共通のヘッダー。アプリ名と、メニュー（☰）を持つ。
 * メニューには、画面をまたいで共通の操作（使い方と注意・自宅の登録）と、バージョンを置く。
 * 画面の移動は、下部のタブバー（App）が持つ。
 */
export function AppHeader() {
  const [panel, setPanel] = useState<"menu" | "help" | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const modalRef = useModal(panel === "menu", () => setPanel(null));

  // ヘルプを閉じたとき、フォーカスがメニューのボタンへ戻るよう、開く前にそこへ移す
  const openHelp = () => {
    menuButton.current?.focus();
    setPanel("help");
  };

  return (
    <header className="app-header">
      <h1>声しか知らない鳥を探す</h1>
      <button ref={menuButton} className="menu-btn" aria-label="メニュー" aria-haspopup="dialog" onClick={() => setPanel("menu")}>
        ☰
      </button>
      {panel === "menu" &&
        createPortal(
          <div className="help-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label="メニュー" onClick={() => setPanel(null)}>
            <div className="help-box menu-box" onClick={(e) => e.stopPropagation()}>
              <h2>メニュー</h2>
              <button className="menu-item" onClick={openHelp}>
                使い方と注意
              </button>
              <PrivacySettings />
              <p className="version">
                v{__APP_VERSION__} ・ 更新: {formatBuildTime(__APP_BUILD_TIME__)}
              </p>
              <button className="help-close" onClick={() => setPanel(null)}>
                閉じる
              </button>
            </div>
          </div>,
          document.body,
        )}
      <HelpNotes open={panel === "help"} onClose={() => setPanel(null)} />
    </header>
  );
}
