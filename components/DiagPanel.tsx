"use client";

import { useEffect, useState } from "react";

type M = {
  innerH: number;
  outerH: number;
  clientH: number;
  vpH: string;
  vpOffTop: string;
  safeTop: number;
  safeBot: number;
  appH: string;
  appBottom: string;
  mainH: string;
  mainBottom: string;
  scrollH: string;
  scrollBottom: string;
  bnTop: string;
  bnBottom: string;
  bnH: string;
};

export default function DiagPanel() {
  const [m, setM] = useState<M | null>(null);

  useEffect(() => {
    const measure = () => {
      // Legge env(safe-area-inset-*) tramite padding trick
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;" +
        "padding-top:env(safe-area-inset-top,0px);" +
        "padding-bottom:env(safe-area-inset-bottom,0px);" +
        "visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const safeTop = Math.round(parseFloat(cs.paddingTop) || 0);
      const safeBot = Math.round(parseFloat(cs.paddingBottom) || 0);
      document.body.removeChild(probe);

      const r = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return { h: "n/a", bottom: "n/a" };
        const rect = el.getBoundingClientRect();
        return { h: String(Math.round(rect.height)), bottom: String(Math.round(rect.bottom)) };
      };

      // Cerca BottomNav: div fixed con bottom:0 che contiene una <nav>
      let bnEl: HTMLElement | null = null;
      document.querySelectorAll("nav").forEach((nav) => {
        const parent = nav.parentElement as HTMLElement | null;
        if (parent && getComputedStyle(parent).position === "fixed") bnEl = parent;
      });
      const bnRect = bnEl ? (bnEl as HTMLElement).getBoundingClientRect() : null;

      const app = r("[data-diag='appshell']");
      const mainEl = r("main");
      const scrollEl = r(".page-scroll");

      setM({
        innerH: Math.round(window.innerHeight),
        outerH: Math.round(window.outerHeight),
        clientH: Math.round(document.documentElement.clientHeight),
        vpH: window.visualViewport
          ? String(Math.round(window.visualViewport.height))
          : "n/a",
        vpOffTop: window.visualViewport
          ? String(Math.round(window.visualViewport.offsetTop))
          : "n/a",
        safeTop,
        safeBot,
        appH: app.h,
        appBottom: app.bottom,
        mainH: mainEl.h,
        mainBottom: mainEl.bottom,
        scrollH: scrollEl.h,
        scrollBottom: scrollEl.bottom,
        bnTop: bnRect ? String(Math.round(bnRect.top)) : "n/a",
        bnBottom: bnRect ? String(Math.round(bnRect.bottom)) : "n/a",
        bnH: bnRect ? String(Math.round(bnRect.height)) : "n/a",
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  if (!m) return null;

  const row = (label: string, val: string, color = "#00ff88") => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#aaa" }}>{label}</span>
      <span style={{ color }}>{val}</span>
    </div>
  );

  return (
    <div
      className="md:hidden"
      style={{
        position: "fixed",
        top: 56,
        left: 4,
        right: 4,
        zIndex: 99998,
        background: "rgba(0,0,0,0.90)",
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        lineHeight: 1.7,
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "#ff6b6b", fontWeight: 700, marginBottom: 2 }}>
        ⚠ DIAG — RIMUOVERE
      </div>
      {row("innerH", String(m.innerH))}
      {row("outerH", String(m.outerH))}
      {row("clientH", String(m.clientH))}
      {row("vpH", m.vpH)}
      {row("vpOffTop", m.vpOffTop)}
      {row("safeTop", String(m.safeTop), "#ffd54f")}
      {row("safeBot", String(m.safeBot), "#ffd54f")}
      <div style={{ borderTop: "1px solid #333", margin: "3px 0" }} />
      {row("appshell.h", m.appH, "#80cbc4")}
      {row("appshell.bottom", m.appBottom, "#80cbc4")}
      {row("main.h", m.mainH, "#ce93d8")}
      {row("main.bottom", m.mainBottom, "#ce93d8")}
      {row("scroll.h", m.scrollH, "#ffb74d")}
      {row("scroll.bottom", m.scrollBottom, "#ffb74d")}
      <div style={{ borderTop: "1px solid #333", margin: "3px 0" }} />
      {row("bn.top", m.bnTop, "#a5d6a7")}
      {row("bn.bottom", m.bnBottom, "#a5d6a7")}
      {row("bn.h", m.bnH, "#a5d6a7")}
    </div>
  );
}
