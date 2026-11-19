import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// 共通フォント（dev-standards: M PLUS Rounded 1c）をセルフホスティングする。文字ごとに分割されており、使う文字の分だけ取得される
import "@fontsource/m-plus-rounded-1c/400.css";
import "@fontsource/m-plus-rounded-1c/700.css";
import { App } from "./App";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
