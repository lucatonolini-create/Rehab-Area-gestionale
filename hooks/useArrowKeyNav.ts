"use client";

import { useEffect, type RefObject } from "react";

/**
 * Aggiunge navigazione con tasti freccia a un container.
 * ArrowDown / ArrowRight → elemento successivo
 * ArrowUp  / ArrowLeft  → elemento precedente
 *
 * @param containerRef ref del container
 * @param selector     CSS selector degli elementi navigabili (default: link, button, input, select, textarea)
 * @param axis         "vertical" | "horizontal" | "both" (default: "both")
 * @param loop         torna al primo/ultimo quando si raggiunge il bordo (default: true)
 */
export function useArrowKeyNav(
  containerRef: RefObject<HTMLElement | null>,
  {
    selector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    axis = "both" as "vertical" | "horizontal" | "both",
    loop = true,
  } = {}
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: KeyboardEvent) => {
      const isVert  = e.key === "ArrowDown" || e.key === "ArrowUp";
      const isHoriz = e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (!isVert && !isHoriz) return;
      if (axis === "vertical"   && !isVert)  return;
      if (axis === "horizontal" && !isHoriz) return;

      // Non intercettare se il focus è su un input testuale
      const tag = (e.target as HTMLElement)?.tagName;
      const type = (e.target as HTMLInputElement)?.type;
      if (tag === "TEXTAREA") return;
      if (tag === "INPUT" && type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit") return;

      const items = Array.from(
        container.querySelectorAll<HTMLElement>(selector)
      ).filter((el) => {
        const input = el as HTMLInputElement;
        return !input.disabled && el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden";
      });

      if (items.length === 0) return;

      const focused = document.activeElement as HTMLElement;
      const idx = items.indexOf(focused);

      // Se nessun elemento del container è focalizzato, vai al primo
      if (idx === -1) {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          items[0].focus();
        } else {
          e.preventDefault();
          items[items.length - 1].focus();
        }
        return;
      }

      const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
      let next: number;
      if (forward) {
        next = loop ? (idx + 1) % items.length : Math.min(idx + 1, items.length - 1);
      } else {
        next = loop ? (idx - 1 + items.length) % items.length : Math.max(idx - 1, 0);
      }

      if (next !== idx) {
        e.preventDefault();
        items[next].focus();
        items[next].scrollIntoView({ block: "nearest" });
      }
    };

    container.addEventListener("keydown", handler);
    return () => container.removeEventListener("keydown", handler);
  }, [containerRef, selector, axis, loop]);
}
