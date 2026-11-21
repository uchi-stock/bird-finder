import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "../hooks/useModal";
import formatBuildTime from "../shared/formatBuildTime.js";
import { Emoji } from "./Emoji";
import { HelpNotes } from "./HelpNotes";
import { PrivacySettings } from "./PrivacySettings";

export type Tab = "search" | "dex" | "quiz" | "map";

const TABS: { tab: Tab; emoji: string; label: string }[] = [
  { tab: "search", emoji: "🔍", label: "探す" },
  { tab: "dex", emoji: "📖", label: "図鑑" },
  { tab: "quiz", emoji: "🎯", label: "クイズ" },
  { tab: "map", emoji: "🗺️", label: "地図" },
];

interface Props {
  /** いま開いている画面 */
  tab: Tab;
  onTab: (tab: Tab) => void;
  /** 図鑑に載せる、捕まえた種数と、全種数（図鑑の項目に添える） */
  caught: number;
  total: number;
}

/**
 * 全画面で共通のヘッダー。アプリ名と、メニュー（☰）を持つ。
 * 画面の移動（探す・図鑑・クイズ・地図）は、メニューの一覧から行う（下部のボタンは廃止した。#199）。
 * メニューには、そのほか、画面をまたいで共通の操作（使い方と注意・自宅の登録）と、バージョンを置く。
 */
export function AppHeader({ tab, onTab, caught, total }: Props) {
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
              <nav className="menu-nav" aria-label="画面の切り替え">
                {TABS.map((t) => (
                  <button
                    key={t.tab}
                    className={t.tab === tab ? "menu-item on" : "menu-item"}
                    aria-current={t.tab === tab ? "page" : undefined}
                    onClick={() => {
                      setPanel(null);
                      onTab(t.tab);
                    }}
                  >
                    <Emoji c={t.emoji} />
                    {t.label}
                    {t.tab === "dex" ? ` ${caught}/${total}` : ""}
                  </button>
                ))}
              </nav>
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
