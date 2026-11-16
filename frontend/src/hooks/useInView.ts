import { useEffect, useRef, useState } from "react";

/**
 * 要素が画面に入ったか（一度入ったら、その後も true のまま）。長い一覧で、見える行だけ画像を取得するために使う。
 * IntersectionObserverが使えない環境では、最初から true にする（全行が取得される。動作は変わらない）
 */
export function useInView<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T>(null);
  const supported = typeof IntersectionObserver !== "undefined";
  const [seen, setSeen] = useState(!supported);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return { ref, seen };
}
