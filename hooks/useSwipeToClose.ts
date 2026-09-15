"use client";

import { useEffect, useRef } from "react";

export function useSwipeToClose(onClose: () => void, threshold = 80) {
  const ref = useRef<HTMLElement | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  // Stable ref so the effect never re-mounts when onClose identity changes
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const isInteractive = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      // Don't swipe-close from range sliders, selects, inputs, textareas,
      // or any DnD drag handle / sortable item
      return !!target.closest(
        'input, select, textarea, [role="slider"], [data-no-swipe], ' +
        '[data-rfd-drag-handle-draggable-id], [data-dnd-kit-drag-handle]'
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      if (isInteractive(e.target)) {
        startX.current = null;
        startY.current = null;
        return;
      }
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      // Require clearly horizontal swipe: dx dominant and past threshold
      if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > threshold) {
        onCloseRef.current();
      }
      startX.current = null;
      startY.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
    // Effect depends only on el identity (ref), not on onClose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  return ref;
}
