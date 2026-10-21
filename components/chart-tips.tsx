"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./charts.module.css";

type Tip = { text: string; x: number; y: number };

/**
 * One tooltip for every chart on the page: any element with data-tip shows
 * its text on hover or keyboard focus. Charts stay server-rendered.
 */
export function ChartTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const find = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;

    function show(el: HTMLElement, x: number, y: number) {
      setTip({ text: el.dataset.tip ?? "", x, y });
    }
    function onMove(event: PointerEvent) {
      const el = find(event.target);
      if (el) show(el, event.clientX, event.clientY);
      else setTip(null);
    }
    function onFocus(event: FocusEvent) {
      const el = find(event.target);
      if (!el) return;
      const box = el.getBoundingClientRect();
      show(el, box.left + box.width / 2, box.top);
    }
    const hide = () => setTip(null);

    document.addEventListener("pointermove", onMove);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide);
    };
  }, []);

  // Keep the tooltip inside the viewport.
  let left = tip?.x ?? 0;
  let top = (tip?.y ?? 0) - 12;
  if (tip && ref.current) {
    const { width, height } = ref.current.getBoundingClientRect();
    left = Math.min(Math.max(8, tip.x - width / 2), window.innerWidth - width - 8);
    top = tip.y - height - 14 < 8 ? tip.y + 18 : tip.y - height - 14;
  }

  return (
    <div
      ref={ref}
      className={styles.tip}
      role="status"
      aria-live="polite"
      style={{ left, top, opacity: tip ? 1 : 0 }}
    >
      {tip?.text}
    </div>
  );
}
