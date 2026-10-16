"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { nd, type Atleta } from "@/lib/store";

export const MACRO_OBJ = [
  { code: "F",  label: "Forza",             bg: "bg-blue-600" },
  { code: "P",  label: "Potenza",           bg: "bg-purple-600" },
  { code: "A",  label: "Accessori",         bg: "bg-slate-500" },
  { code: "C",  label: "Campo",             bg: "bg-green-600" },
  { code: "Co", label: "Compound",          bg: "bg-orange-500" },
  { code: "U",  label: "Upper",             bg: "bg-cyan-600" },
  { code: "NM", label: "Controllo Motorio", bg: "bg-amber-500" },
  { code: "S",  label: "Scarico",           bg: "bg-sky-400" },
  { code: "M",  label: "Metabolico",        bg: "bg-rose-600" },
  { code: "I",  label: "Isometrie",         bg: "bg-violet-600" },
  { code: "R",  label: "Riposo",            bg: "bg-gray-400" },
] as const;

const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
const GIORNI_KEYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"] as const;
type GiornoKey = (typeof GIORNI_KEYS)[number];
type PianoGiorni = Record<GiornoKey, string[]>;
const EMPTY_PIANO: PianoGiorni = { lun: [], mar: [], mer: [], gio: [], ven: [], sab: [], dom: [] };
const SNAP_MS = 280;

function mondayOfIsoWeek(isoWeek: string): Date {
  const [year, week] = isoWeek.split("-W").map(Number);
  const jan4 = new Date(year, 0, 4);
  const w1mon = new Date(jan4);
  w1mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const mon = new Date(w1mon);
  mon.setDate(w1mon.getDate() + (week - 1) * 7);
  return mon;
}
function dateToIsoWeek(d: Date): string {
  const thu = new Date(d);
  thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const year = thu.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const w1mon = new Date(jan4);
  w1mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = Math.floor((thu.getTime() - w1mon.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function shiftWeek(isoWeek: string, delta: number): string {
  const mon = mondayOfIsoWeek(isoWeek);
  mon.setDate(mon.getDate() + delta * 7);
  return dateToIsoWeek(mon);
}
function isoWeekDates(isoWeek: string): string[] {
  const mon = mondayOfIsoWeek(isoWeek);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}
function currentIsoWeek(): string { return dateToIsoWeek(new Date()); }

function lsKey(atletaId: string, settimana: string) { return `piano_sett_${atletaId}_${settimana}`; }
function lsLoad(atletaId: string, settimana: string): PianoGiorni {
  try {
    const raw = localStorage.getItem(lsKey(atletaId, settimana));
    return raw ? { ...EMPTY_PIANO, ...JSON.parse(raw) } : { ...EMPTY_PIANO };
  } catch { return { ...EMPTY_PIANO }; }
}
function lsSave(atletaId: string, settimana: string, piano: PianoGiorni) {
  try { localStorage.setItem(lsKey(atletaId, settimana), JSON.stringify(piano)); } catch {}
}

function WeekGrid({
  panelRef, settimana, piano, today, onDayClick,
}: {
  panelRef?: React.Ref<HTMLDivElement>;
  settimana: string;
  piano: PianoGiorni;
  today: string;
  onDayClick: (key: GiornoKey) => void;
}) {
  const weekDates = isoWeekDates(settimana);
  return (
    <div ref={panelRef} className="grid grid-cols-7 gap-1 md:gap-2 w-full">
      {GIORNI_BREVI.map((label, i) => {
        const key = GIORNI_KEYS[i];
        const date = weekDates[i];
        const isToday = date === today;
        const objs = piano[key];
        return (
          <button key={key} onClick={() => onDayClick(key)}
            className={`flex flex-col items-center rounded-xl md:rounded-2xl border min-h-[76px] md:min-h-[110px] transition-colors ${
              isToday ? "border-[#C8102E] bg-red-50" : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
            }`}
          >
            <p className={`text-[10px] md:text-xs font-bold pt-2 md:pt-3 ${isToday ? "text-[#C8102E]" : "text-gray-400"}`}>{label}</p>
            <p className={`text-[10px] md:text-sm font-semibold mb-1.5 md:mb-2 ${isToday ? "text-[#C8102E]" : "text-gray-600"}`}>{date.slice(8)}</p>
            <div className="flex flex-col gap-0.5 md:gap-1 px-1 md:px-1.5 pb-2 md:pb-3 w-full">
              {objs.length === 0
                ? <span className="text-[9px] text-gray-200 text-center">·</span>
                : objs.map((code) => {
                    const obj = MACRO_OBJ.find((o) => o.code === code);
                    if (!obj) return null;
                    return (
                      <span key={code} className={`${obj.bg} text-white text-[9px] md:text-[10px] font-bold rounded md:rounded-md px-0.5 py-0.5 text-center leading-tight`}>
                        {code}
                      </span>
                    );
                  })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function CalendarioSettimanale({ atleti }: { atleti: Atleta[] }) {
  const atletiAttivi = atleti
    .filter((a) => a.stato === "Infortunato" || a.stato === "NTL")
    .sort((a, b) => nd(a).localeCompare(nd(b), "it"));

  const [atletaId, setAtletaId] = useState<string>("");
  const [settimana, setSettimana] = useState(currentIsoWeek);
  const [piano, setPiano] = useState<PianoGiorni>({ ...EMPTY_PIANO });
  const [editGiorno, setEditGiorno] = useState<GiornoKey | null>(null);

  // Drag state
  const [adjWeek, setAdjWeek] = useState<string | null>(null);
  const [adjPiano, setAdjPiano] = useState<PianoGiorni>({ ...EMPTY_PIANO });

  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const adjRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const dragDir = useRef<"left" | "right" | null>(null); // locked per-gesture
  const lastDx = useRef(0);
  const blocked = useRef(false); // gesture locked as vertical scroll

  useEffect(() => {
    if (atletaId) setPiano(lsLoad(atletaId, settimana));
  }, [atletaId, settimana]);

  const applyTransforms = (dx: number, dir: "left" | "right") => {
    const W = containerRef.current?.offsetWidth ?? 300;
    const adjBase = dir === "left" ? W : -W;
    if (currentRef.current) currentRef.current.style.transform = `translateX(${dx}px)`;
    if (adjRef.current) adjRef.current.style.transform = `translateX(${adjBase + dx}px)`;
  };

  const snapTo = (targetDx: number, dir: "left" | "right", onDone: () => void) => {
    const W = containerRef.current?.offsetWidth ?? 300;
    const adjBase = dir === "left" ? W : -W;
    const easing = `transform ${SNAP_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
    if (currentRef.current) {
      currentRef.current.style.transition = easing;
      currentRef.current.style.transform = `translateX(${targetDx}px)`;
    }
    if (adjRef.current) {
      adjRef.current.style.transition = easing;
      adjRef.current.style.transform = `translateX(${adjBase + targetDx}px)`;
    }
    setTimeout(() => {
      if (currentRef.current) { currentRef.current.style.transform = ""; currentRef.current.style.transition = ""; }
      if (adjRef.current) { adjRef.current.style.transform = ""; adjRef.current.style.transition = ""; }
      onDone();
    }, SNAP_MS + 20);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    dragDir.current = null;
    lastDx.current = 0;
    blocked.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // First movement: decide horizontal vs vertical
    if (dragDir.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      if (Math.abs(dy) > Math.abs(dx)) {
        blocked.current = true; // vertical scroll wins
        return;
      }
      dragDir.current = dx < 0 ? "left" : "right";
      const adjW = shiftWeek(settimana, dragDir.current === "left" ? 1 : -1);
      const adjP = atletaId ? lsLoad(atletaId, adjW) : { ...EMPTY_PIANO };
      setAdjWeek(adjW);
      setAdjPiano(adjP);
    }

    if (blocked.current || !dragDir.current) return;

    // Prevent page scroll while dragging horizontally
    e.preventDefault?.();

    lastDx.current = dx;
    applyTransforms(dx, dragDir.current);
  };

  const handleTouchEnd = () => {
    if (blocked.current || !dragDir.current) return;
    const W = containerRef.current?.offsetWidth ?? 300;
    const threshold = W * 0.30;
    const dx = lastDx.current;
    const dir = dragDir.current;

    if (Math.abs(dx) >= threshold) {
      // Commit: slide off screen then switch week
      const targetDx = dir === "left" ? -W : W;
      snapTo(targetDx, dir, () => {
        const delta = dir === "left" ? 1 : -1;
        const newWeek = shiftWeek(settimana, delta);
        setSettimana(newWeek);
        setPiano(adjPiano);
        setAdjWeek(null);
        dragDir.current = null;
      });
    } else {
      // Snap back
      snapTo(0, dir, () => {
        setAdjWeek(null);
        dragDir.current = null;
      });
    }
  };

  // Arrow button slide animation
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goWeek = useCallback((delta: number) => {
    if (dragDir.current !== null) return;
    const dir: "left" | "right" = delta > 0 ? "left" : "right";
    const adjW = shiftWeek(settimana, delta);
    const adjP = atletaId ? lsLoad(atletaId, adjW) : { ...EMPTY_PIANO };
    const W = containerRef.current?.offsetWidth ?? 300;

    setAdjWeek(adjW);
    setAdjPiano(adjP);

    // Position adjacent off-screen instantly, then animate
    requestAnimationFrame(() => {
      if (adjRef.current) adjRef.current.style.transform = `translateX(${dir === "left" ? W : -W}px)`;
      requestAnimationFrame(() => {
        const easing = `transform ${SNAP_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        if (currentRef.current) { currentRef.current.style.transition = easing; currentRef.current.style.transform = `translateX(${dir === "left" ? -W : W}px)`; }
        if (adjRef.current) { adjRef.current.style.transition = easing; adjRef.current.style.transform = `translateX(0px)`; }
        if (animRef.current) clearTimeout(animRef.current);
        animRef.current = setTimeout(() => {
          if (currentRef.current) { currentRef.current.style.transform = ""; currentRef.current.style.transition = ""; }
          if (adjRef.current) { adjRef.current.style.transform = ""; adjRef.current.style.transition = ""; }
          setSettimana(adjW);
          setPiano(adjP);
          setAdjWeek(null);
        }, SNAP_MS + 20);
      });
    });
  }, [settimana, atletaId]);

  useEffect(() => () => { if (animRef.current) clearTimeout(animRef.current); }, []);

  if (atletiAttivi.length === 0) return null;

  const weekDates = isoWeekDates(settimana);
  const todayStr = new Date().toISOString().slice(0, 10);
  const editIdx = editGiorno ? GIORNI_KEYS.indexOf(editGiorno) : -1;
  const fmt = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`;

  return (
    <div className="mb-6 pb-6 border-b border-gray-100">
      <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Piano Settimanale</h2>

      {/* Intestazione: select + navigazione settimana */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={atletaId}
          onChange={(e) => setAtletaId(e.target.value)}
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white text-gray-700"
        >
          <option value="">Seleziona atleta…</option>
          {atletiAttivi.map((a) => (
            <option key={a.id} value={a.id}>
              {nd(a)}{a.stato === "Infortunato" ? " · Infortuno" : " · NTL"}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => goWeek(-1)} className="p-2 md:p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 active:bg-gray-100">
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
          </button>
          <span className="text-[10px] md:text-xs text-gray-600 font-medium px-2 text-center w-[90px] md:w-[110px] leading-tight">
            {fmt(weekDates[0])} – {fmt(weekDates[6])}.{weekDates[6].slice(2, 4)}
          </span>
          <button onClick={() => goWeek(1)} className="p-2 md:p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 active:bg-gray-100">
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Griglia con drag */}
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none"
        style={{ touchAction: "pan-y" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <WeekGrid
          panelRef={currentRef}
          settimana={settimana}
          piano={piano}
          today={todayStr}
          onDayClick={(key) => atletaId && setEditGiorno(key)}
        />
        {adjWeek && (
          <div ref={adjRef} className="absolute inset-0">
            <WeekGrid
              settimana={adjWeek}
              piano={adjPiano}
              today={todayStr}
              onDayClick={() => {}}
            />
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[...MACRO_OBJ].sort((a, b) => a.label.localeCompare(b.label, "it")).map((obj) => (
          <span key={obj.code} className={`${obj.bg} text-white text-[9px] md:text-[11px] font-semibold rounded-lg px-2 py-1 flex items-center gap-1.5`}>
            <span className="font-bold">{obj.code}</span>
            <span className="opacity-80 font-normal">{obj.label}</span>
          </span>
        ))}
      </div>

      {/* Modal */}
      {editGiorno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setEditGiorno(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm md:max-w-md flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "calc(100dvh - 160px)" }}
          >
            {/* Header fisso */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
              <h3 className="font-semibold text-gray-900">
                {GIORNI_BREVI[editIdx]}{" "}
                <span className="text-gray-400 font-normal text-sm">
                  {weekDates[editIdx]?.slice(5).split("-").reverse().join("/")}
                </span>
              </h3>
              <button onClick={() => setEditGiorno(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista obiettivi scrollabile */}
            <div className="overflow-y-auto flex-1 px-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pb-2">
                {MACRO_OBJ.map((obj) => {
                  const active = piano[editGiorno].includes(obj.code);
                  return (
                    <button
                      key={obj.code}
                      onClick={() => {
                        setPiano((prev) => {
                          const curr = prev[editGiorno];
                          const next = curr.includes(obj.code) ? curr.filter((c) => c !== obj.code) : [...curr, obj.code];
                          const updated = { ...prev, [editGiorno]: next };
                          if (atletaId) lsSave(atletaId, settimana, updated);
                          return updated;
                        });
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                        active ? `${obj.bg} border-transparent` : "bg-white border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <span className={`text-xs md:text-sm font-bold w-6 md:w-7 shrink-0 ${active ? "text-white" : "text-gray-700"}`}>{obj.code}</span>
                      <span className={`text-xs md:text-sm leading-tight ${active ? "text-white/90" : "text-gray-500"}`}>{obj.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottone fisso in fondo */}
            <div
              className="px-5 pt-3 shrink-0"
              style={{ paddingBottom: "16px" }}
            >
              <button
                onClick={() => setEditGiorno(null)}
                className="w-full bg-[#C8102E] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-800"
              >
                Fatto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
