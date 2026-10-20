"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, X, Maximize2 } from "lucide-react";
import { nd, type Atleta } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export const MACRO_OBJ = [
  { code: "A",  label: "Accessori",         bg: "bg-slate-500",   hex: "#64748b" },
  { code: "AS", label: "Assente",           bg: "bg-red-400",     hex: "#f87171" },
  { code: "C",  label: "Campo",             bg: "bg-green-600",   hex: "#16a34a" },
  { code: "CO", label: "Compound",          bg: "bg-orange-500",  hex: "#f97316" },
  { code: "CM", label: "Controllo Motorio", bg: "bg-indigo-500",  hex: "#6366f1" },
  { code: "D",  label: "Differenziato",     bg: "bg-fuchsia-600", hex: "#c026d3" },
  { code: "F",  label: "Forza",             bg: "bg-blue-600",    hex: "#2563eb" },
  { code: "I",  label: "Isometrie",         bg: "bg-violet-600",  hex: "#7c3aed" },
  { code: "M",  label: "Metabolico",        bg: "bg-rose-600",    hex: "#e11d48" },
  { code: "NM", label: "Neuromuscolare",    bg: "bg-amber-500",   hex: "#f59e0b" },
  { code: "PS", label: "Parziale Squadra",  bg: "bg-lime-600",    hex: "#65a30d" },
  { code: "P",  label: "Potenza",           bg: "bg-purple-600",  hex: "#9333ea" },
  { code: "R",  label: "Riposo",            bg: "bg-gray-400",    hex: "#9ca3af" },
  { code: "S",  label: "Scarico",           bg: "bg-sky-400",     hex: "#38bdf8" },
  { code: "SQ", label: "Squadra",           bg: "bg-emerald-600", hex: "#059669" },
  { code: "T",  label: "Tecnico",           bg: "bg-teal-600",    hex: "#0d9488" },
  { code: "U",  label: "Upper",             bg: "bg-cyan-600",    hex: "#0891b2" },
] as const;

/** Restituisce i codici macro obiettivo assegnati a un atleta per una data specifica (da localStorage). */
export function getObiettiviForDate(atletaId: string, dateStr: string): string[] {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const thu = new Date(d);
    thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
    const year = thu.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const w1mon = new Date(jan4);
    w1mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const week = Math.floor((thu.getTime() - w1mon.getTime()) / (7 * 86400000)) + 1;
    const isoWeek = `${year}-W${String(week).padStart(2, "0")}`;
    const raw = localStorage.getItem(`piano_sett_${atletaId}_${isoWeek}`);
    if (!raw) return [];
    const piano = JSON.parse(raw) as Record<string, string[]>;
    const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const key = GIORNI_KEYS[dayIdx];
    return piano[key] ?? [];
  } catch { return []; }
}

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
async function dbSave(atletaId: string, settimana: string, piano: PianoGiorni) {
  if (!atletaId) return;
  try {
    await supabase.from("piani_settimanali").upsert(
      { atleta_id: atletaId, settimana, piano },
      { onConflict: "atleta_id,settimana" }
    );
  } catch {}
}
async function dbLoad(atletaId: string, settimana: string): Promise<PianoGiorni | null> {
  if (!atletaId) return null;
  try {
    const { data } = await supabase
      .from("piani_settimanali")
      .select("piano")
      .eq("atleta_id", atletaId)
      .eq("settimana", settimana)
      .single();
    if (data?.piano) return { ...EMPTY_PIANO, ...(data.piano as PianoGiorni) };
  } catch {}
  return null;
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
    .filter((a) => a.stato === "Infortunato")
    .sort((a, b) => nd(a).localeCompare(nd(b), "it"));

  const [atletaIds, setAtletaIds] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [ricercaAtleta, setRicercaAtleta] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ricercaInputRef = useRef<HTMLInputElement>(null);
  const [settimana, setSettimana] = useState(currentIsoWeek);
  const [piano, setPiano] = useState<PianoGiorni>({ ...EMPTY_PIANO });
  const [editGiorno, setEditGiorno] = useState<GiornoKey | null>(null);
  const [appliedDays, setAppliedDays] = useState<Set<GiornoKey>>(new Set());
  const pianoSnapshotRef = useRef<PianoGiorni>({ ...EMPTY_PIANO });

  const [mostraVistaTotale, setMostraVistaTotale] = useState(false);
  const [pianiTutti, setPianiTutti] = useState<Record<string, PianoGiorni>>({});
  const [atletiVista, setAtletiVista] = useState<Atleta[]>([]);
  const [caricandoVista, setCaricandoVista] = useState(false);
  const [editCell, setEditCell] = useState<{ atletaId: string; giornoKey: GiornoKey } | null>(null);
  const [editCellCodes, setEditCellCodes] = useState<string[]>([]);
  const [editCellExtra, setEditCellExtra] = useState<Set<string>>(new Set());
  const [editCellExtraDays, setEditCellExtraDays] = useState<Set<GiornoKey>>(new Set());

  // Chiudi dropdown cliccando fuori
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleAtleta = (id: string) => {
    setAtletaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const atletaId = atletaIds[0] ?? "";

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

  // Migrazione one-shot: carica su Supabase tutti i piani già in localStorage
  useEffect(() => {
    const MIGRATION_KEY = "usc_piano_migrated_v1";
    if (typeof window === "undefined") return;
    if (localStorage.getItem(MIGRATION_KEY)) return;
    const prefix = "piano_sett_";
    const entries: { atletaId: string; settimana: string; piano: PianoGiorni }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length); // "atletaId_2026-W43"
      const wIdx = rest.lastIndexOf("_20"); // separa atletaId dalla settimana
      if (wIdx < 0) continue;
      const atletaId = rest.slice(0, wIdx);
      const settimana = rest.slice(wIdx + 1);
      try {
        const raw = localStorage.getItem(key);
        if (raw) entries.push({ atletaId, settimana, piano: { ...EMPTY_PIANO, ...JSON.parse(raw) } });
      } catch {}
    }
    if (entries.length === 0) { localStorage.setItem(MIGRATION_KEY, "1"); return; }
    Promise.all(entries.map((e) => dbSave(e.atletaId, e.settimana, e.piano)))
      .then(() => localStorage.setItem(MIGRATION_KEY, "1"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!atletaId) { setPiano({ ...EMPTY_PIANO }); return; }
    // Carica subito da localStorage (istantaneo), poi sovrascrive con Supabase se disponibile
    setPiano(lsLoad(atletaId, settimana));
    dbLoad(atletaId, settimana).then((remote) => {
      if (remote) {
        setPiano(remote);
        lsSave(atletaId, settimana, remote); // aggiorna cache locale
      }
    });
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

  // Navigazione settimana con tasti freccia (← →)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editGiorno) return; // modale aperto
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); goWeek(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); goWeek(1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editGiorno, goWeek]);


  // Carica piani di tutti gli atleti per la vista totale
  useEffect(() => {
    if (!mostraVistaTotale) return;
    setCaricandoVista(true);
    const tutti = getAtletiSettimana().sort((a, b) => nd(a).localeCompare(nd(b), "it"));
    setAtletiVista(tutti);
    const pianiLocali: Record<string, PianoGiorni> = {};
    tutti.forEach((a) => { pianiLocali[a.id] = lsLoad(a.id, settimana); });
    setPianiTutti({ ...pianiLocali });
    Promise.all(tutti.map((a) =>
      dbLoad(a.id, settimana).then((remote) => {
        if (remote) { pianiLocali[a.id] = remote; lsSave(a.id, settimana, remote); }
      }).catch(() => {})
    )).then(() => { setPianiTutti({ ...pianiLocali }); setCaricandoVista(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostraVistaTotale, settimana]);

  // Snapshot piano quando si apre la finestra, reset applied days
  useEffect(() => {
    if (editGiorno) {
      pianoSnapshotRef.current = JSON.parse(JSON.stringify(piano));
      setAppliedDays(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editGiorno]);

  // Collect all athletes that have data for the current week (union of active + any with LS data)
  const getAtletiSettimana = () => {
    const prefix = "piano_sett_";
    const suffix = `_${settimana}`;
    const idsWithData = new Set<string>(atletiAttivi.map((a) => a.id));
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(prefix) && k.endsWith(suffix))
        .forEach((k) => {
          const id = k.slice(prefix.length, k.length - suffix.length);
          if (id) idsWithData.add(id);
        });
    } catch {}
    return Array.from(idsWithData)
      .map((id) => atleti.find((a) => a.id === id))
      .filter((a): a is Atleta => !!a && a.stato === "Infortunato");
  };

  const exportCSV = () => {
    const atletiEsport = getAtletiSettimana().sort((a, b) => nd(a).localeCompare(nd(b), "it"));
    const wDates = isoWeekDates(settimana);
    const fmtD = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
    const header = ["Atleta", ...GIORNI_BREVI.map((g, i) => `${g} ${fmtD(wDates[i])}`)];
    const rows = atletiEsport.map((a) => {
      const p = lsLoad(a.id, settimana);
      return [nd(a), ...GIORNI_KEYS.map((k) => p[k].join(" "))];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario_${settimana}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const atletiEsport = getAtletiSettimana().sort((a, b) => nd(a).localeCompare(nd(b), "it"));
    const wDates = isoWeekDates(settimana);
    const fmtD = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Piano Settimanale – ${settimana}`, 14, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`${fmtD(wDates[0])} – ${fmtD(wDates[6])}`, 14, 22);

    const head = [["Atleta", ...GIORNI_BREVI.map((g, i) => `${g}\n${fmtD(wDates[i])}`)]];
    const body = atletiEsport.map((a) => {
      const p = lsLoad(a.id, settimana);
      return [nd(a), ...GIORNI_KEYS.map((k) => p[k].join(", ") || "–")];
    });

    autoTable(doc, {
      head,
      body,
      startY: 27,
      styles: { fontSize: 8, cellPadding: 2.5, valign: "middle" },
      headStyles: { fillColor: [200, 16, 46], textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 38 },
        1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" },
        4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "center" }, 7: { halign: "center" },
      },
      alternateRowStyles: { fillColor: [250, 250, 252] },
    });

    doc.save(`calendario_${settimana}.pdf`);
  };

  if (atletiAttivi.length === 0) return null;

  const weekDates = isoWeekDates(settimana);
  const todayStr = new Date().toISOString().slice(0, 10);
  const editIdx = editGiorno ? GIORNI_KEYS.indexOf(editGiorno) : -1;
  const fmt = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`;

  return (
    <div className="mb-6 pb-6 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Piano Settimanale</h2>
        <div className="flex items-center gap-1">
          <button onClick={exportCSV} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-[10px] font-semibold text-gray-500 leading-none" title="Scarica CSV">CSV</button>
          <button onClick={exportPDF} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-[10px] font-semibold text-gray-500 leading-none" title="Scarica PDF">PDF</button>
          <button onClick={() => setMostraVistaTotale(true)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-gray-500" title="Vista completa">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Intestazione: multi-select atleti + navigazione settimana */}
      <div className="flex items-center gap-2 mb-4">
        {/* Dropdown multi-selezione */}
        <div ref={dropdownRef} className="relative flex-1 min-w-0">
          <button
            onClick={() => { setDropdownOpen((v) => { if (!v) { setRicercaAtleta(""); setTimeout(() => ricercaInputRef.current?.focus(), 50); } return !v; }); }}
            className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2 text-sm md:text-base bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C8102E] text-left"
          >
            <span className={atletaIds.length === 0 ? "text-gray-400" : "text-gray-800 font-medium"}>
              {atletaIds.length === 0
                ? "Seleziona atleta…"
                : atletaIds.length === 1
                ? nd(atletiAttivi.find((a) => a.id === atletaIds[0])!)
                : `${atletaIds.length} atleti selezionati`}
            </span>
            <svg className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {dropdownOpen && (
            <div className="absolute z-40 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {/* Azioni rapide */}
              <div className="flex border-b border-gray-100">
                <button onClick={() => setAtletaIds(atletiAttivi.map((a) => a.id))} className="flex-1 py-1.5 text-xs text-[#C8102E] font-semibold hover:bg-red-50">Tutti</button>
                <div className="w-px bg-gray-100" />
                <button onClick={() => setAtletaIds([])} className="flex-1 py-1.5 text-xs text-gray-500 font-semibold hover:bg-gray-50">Nessuno</button>
              </div>
              {/* Ricerca atleta */}
              <div className="px-3 py-2 border-b border-gray-100">
                <input
                  ref={ricercaInputRef}
                  type="text"
                  value={ricercaAtleta}
                  onChange={(e) => setRicercaAtleta(e.target.value)}
                  placeholder="Cerca atleta…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              {/* Lista atleti con checkbox */}
              <div className="max-h-52 overflow-y-auto">
                {atletiAttivi.filter((a) => !ricercaAtleta.trim() || nd(a).toLowerCase().includes(ricercaAtleta.trim().toLowerCase())).map((a) => {
                  const checked = atletaIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAtleta(a.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${checked ? "bg-red-50/60" : ""}`}
                    >
                      <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${checked ? "bg-[#C8102E] border-[#C8102E]" : "border-gray-300"}`}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <span className="text-sm text-gray-800 leading-tight">{nd(a)}</span>
                      <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${a.stato === "Infortunato" ? "bg-orange-100 text-orange-600" : "bg-red-100 text-red-600"}`}>
                        {a.stato === "Infortunato" ? "INF" : "NTL"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Footer con conferma */}
              <div className="border-t border-gray-100 px-3 py-2">
                <button onClick={() => setDropdownOpen(false)} className="w-full bg-[#C8102E] text-white text-xs font-semibold py-1.5 rounded-lg">
                  {atletaIds.length === 0 ? "Chiudi" : `Conferma (${atletaIds.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
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
          onDayClick={(key) => atletaIds.length > 0 && setEditGiorno(key)}
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

      {/* Vista totale: tutti gli atleti × tutti i giorni */}
      {mostraVistaTotale && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          {/* Header */}
          <div className="flex flex-col px-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center justify-between py-3">
              <h2 className="text-sm font-bold text-gray-800">Piano Settimanale</h2>
              <button onClick={() => setMostraVistaTotale(false)} className="p-2 text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 pb-3">
              <button onClick={() => goWeek(-1)} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-xs font-semibold text-gray-700 px-2 w-[140px] text-center">
                {fmt(weekDates[0])} – {fmt(weekDates[6])}.{weekDates[6].slice(2, 4)}
              </span>
              <button onClick={() => goWeek(1)} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Tabella scrollabile */}
          {caricandoVista ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Caricamento…</div>
          ) : atletiVista.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Nessun piano per questa settimana</div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 560 }}>
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th className="sticky left-0 z-20 bg-white text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-r border-gray-100 min-w-[120px]">
                      Atleta
                    </th>
                    {weekDates.map((date, i) => {
                      const isToday = date === todayStr;
                      return (
                        <th key={i} className={`px-2 py-2.5 text-center border-b border-gray-100 font-semibold min-w-[64px] ${isToday ? "text-[#C8102E]" : "text-gray-500"}`}>
                          <span className="block text-[10px] uppercase tracking-wide">{GIORNI_BREVI[i]}</span>
                          <span className={`block text-sm font-bold ${isToday ? "text-[#C8102E]" : "text-gray-700"}`}>{date.slice(8)}/{date.slice(5, 7)}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {atletiVista.map((a, rowIdx) => {
                    const p = pianiTutti[a.id] ?? EMPTY_PIANO;
                    return (
                      <tr key={a.id} className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                        <td className={`sticky left-0 z-10 px-3 py-2 border-r border-gray-100 font-semibold text-gray-800 text-xs leading-tight ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                          {nd(a)}
                        </td>
                        {GIORNI_KEYS.map((key, di) => {
                          const isToday = weekDates[di] === todayStr;
                          const codes = p[key];
                          return (
                            <td key={key} className={`px-1 py-1 text-center align-middle border-b border-gray-50 ${isToday ? "bg-red-50/40" : ""}`}>
                              <button
                                onClick={() => { setEditCell({ atletaId: a.id, giornoKey: key }); setEditCellCodes([...(pianiTutti[a.id]?.[key] ?? [])]); setEditCellExtra(new Set()); setEditCellExtraDays(new Set()); }}
                                className={`w-full min-h-[36px] rounded-lg flex flex-wrap gap-0.5 justify-center items-center px-1 py-1 transition-colors hover:bg-gray-100 active:bg-gray-200`}
                              >
                                {codes.length === 0 ? (
                                  <span className="text-gray-200 text-[10px]">·</span>
                                ) : (
                                  codes.map((code) => {
                                    const obj = MACRO_OBJ.find((o) => o.code === code);
                                    if (!obj) return null;
                                    return (
                                      <span
                                        key={code}
                                        title={obj.label}
                                        className="text-white text-[9px] font-bold rounded px-1 py-0.5 leading-tight"
                                        style={{ backgroundColor: obj.hex }}
                                      >
                                        {code}
                                      </span>
                                    );
                                  })
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal modifica cella */}
          {editCell && (() => {
            const atleta = atletiVista.find((a) => a.id === editCell.atletaId);
            const dayIdx = GIORNI_KEYS.indexOf(editCell.giornoKey);
            const dateLabel = weekDates[dayIdx]?.slice(5).split("-").reverse().join("/");
            const toggleCode = (code: string) => {
              setEditCellCodes((prev) =>
                prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
              );
            };
            const giorni = [editCell.giornoKey, ...Array.from(editCellExtraDays)];
            const conferma = () => {
              const ids = [editCell.atletaId, ...Array.from(editCellExtra)];
              setPianiTutti((prev) => {
                const next = { ...prev };
                ids.forEach((id) => {
                  let updatedPiano = { ...(prev[id] ?? EMPTY_PIANO) };
                  giorni.forEach((g) => { updatedPiano = { ...updatedPiano, [g]: editCellCodes }; });
                  next[id] = updatedPiano;
                  lsSave(id, settimana, updatedPiano);
                  dbSave(id, settimana, updatedPiano);
                });
                return next;
              });
              setEditCell(null);
            };
            const altriAtleti = atletiVista.filter((a) => a.id !== editCell.atletaId);
            return (
              <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0" onClick={conferma}>
                <div className="absolute inset-0 bg-black/40" />
                <div
                  className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
                  style={{ maxHeight: "calc(100dvh - 80px)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                    <div>
                      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{atleta ? nd(atleta) : ""}</p>
                      <h3 className="font-bold text-gray-900 text-base">
                        {GIORNI_BREVI[dayIdx]}{" "}
                        <span className="text-gray-400 font-normal text-sm">{dateLabel}</span>
                      </h3>
                    </div>
                    <button onClick={conferma} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="overflow-y-auto flex-1 px-5">
                    {/* Obiettivi */}
                    <div className="grid grid-cols-2 gap-2 pb-3">
                      {MACRO_OBJ.map((obj) => {
                        const active = editCellCodes.includes(obj.code);
                        return (
                          <button
                            key={obj.code}
                            onClick={() => toggleCode(obj.code)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${active ? `${obj.bg} border-transparent` : "bg-white border-gray-100 hover:border-gray-200"}`}
                          >
                            <span className={`text-xs font-bold w-6 shrink-0 ${active ? "text-white" : "text-gray-700"}`}>{obj.code}</span>
                            <span className={`text-xs leading-tight ${active ? "text-white/90" : "text-gray-500"}`}>{obj.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Applica anche a */}
                    {altriAtleti.length > 0 && (
                      <div className="border-t border-gray-100 pt-3 pb-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Applica anche a</p>
                          <button
                            onClick={() => setEditCellExtra((prev) =>
                              prev.size === altriAtleti.length ? new Set() : new Set(altriAtleti.map((a) => a.id))
                            )}
                            className="text-[10px] font-semibold text-[#C8102E] hover:underline"
                          >
                            {editCellExtra.size === altriAtleti.length ? "Nessuno" : "Tutti"}
                          </button>
                        </div>
                        <div className="flex flex-col gap-1">
                          {altriAtleti.map((a) => {
                            const checked = editCellExtra.has(a.id);
                            return (
                              <button
                                key={a.id}
                                onClick={() => setEditCellExtra((prev) => {
                                  const s = new Set(prev);
                                  checked ? s.delete(a.id) : s.add(a.id);
                                  return s;
                                })}
                                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${checked ? "bg-red-50 border border-[#C8102E]/20" : "bg-gray-50 border border-transparent hover:bg-gray-100"}`}
                              >
                                <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${checked ? "bg-[#C8102E] border-[#C8102E]" : "border-gray-300"}`}>
                                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                <span className="text-xs text-gray-800 font-medium">{nd(a)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Applica anche a giorni */}
                    <div className="border-t border-gray-100 pt-3 pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Applica anche a giorni</p>
                        <button
                          onClick={() => setEditCellExtraDays((prev) => {
                            const altri = GIORNI_KEYS.filter((k) => k !== editCell.giornoKey);
                            return prev.size === altri.length ? new Set() : new Set(altri);
                          })}
                          className="text-[10px] font-semibold text-[#C8102E] hover:underline"
                        >
                          {editCellExtraDays.size === GIORNI_KEYS.filter((k) => k !== editCell.giornoKey).length ? "Nessuno" : "Tutti"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {GIORNI_KEYS.filter((k) => k !== editCell.giornoKey).map((key) => {
                          const idx = GIORNI_KEYS.indexOf(key);
                          const checked = editCellExtraDays.has(key);
                          return (
                            <button
                              key={key}
                              onClick={() => setEditCellExtraDays((prev) => {
                                const next = new Set(prev);
                                next.has(key) ? next.delete(key) : next.add(key);
                                return next;
                              })}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${checked ? "bg-[#C8102E] text-white border-[#C8102E]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
                            >
                              {GIORNI_BREVI[idx]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-4 shrink-0">
                    <button onClick={conferma} className="w-full bg-[#C8102E] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-800">
                      {(editCellExtra.size > 0 || editCellExtraDays.size > 0)
                        ? `Salva per ${1 + editCellExtra.size} atleti × ${1 + editCellExtraDays.size} giorni`
                        : "Fatto"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal */}
      {editGiorno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setEditGiorno(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md md:max-w-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "calc(100dvh - 160px)" }}
          >
            {/* Header fisso */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {GIORNI_BREVI[editIdx]}{" "}
                  <span className="text-gray-400 font-normal text-sm">
                    {weekDates[editIdx]?.slice(5).split("-").reverse().join("/")}
                  </span>
                </h3>
                {atletaIds.length > 1 && (
                  <p className="text-[11px] text-[#C8102E] font-medium mt-0.5">{atletaIds.length} atleti · piano condiviso</p>
                )}
              </div>
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
                          atletaIds.forEach((id) => { lsSave(id, settimana, updated); dbSave(id, settimana, updated); });
                          return updated;
                        });
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left min-w-0 overflow-hidden ${
                        active ? `${obj.bg} border-transparent` : "bg-white border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <span className={`text-xs md:text-sm font-bold w-6 md:w-7 shrink-0 ${active ? "text-white" : "text-gray-700"}`}>{obj.code}</span>
                      <span className={`text-xs md:text-sm leading-tight min-w-0 ${active ? "text-white/90" : "text-gray-500"}`}>{obj.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Applica ad altri giorni */}
            {editGiorno && piano[editGiorno].length > 0 && (
              <div className="px-5 pb-3 shrink-0">
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Applica anche a</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {GIORNI_KEYS.filter((k) => k !== editGiorno).map((key) => {
                      const idx = GIORNI_KEYS.indexOf(key);
                      const isApplied = appliedDays.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            if (isApplied) {
                              // Deseleziona: ripristina il valore originale
                              setPiano((prev) => {
                                const updated = { ...prev, [key]: [...pianoSnapshotRef.current[key]] };
                                atletaIds.forEach((id) => { lsSave(id, settimana, updated); dbSave(id, settimana, updated); });
                                return updated;
                              });
                              setAppliedDays((prev) => { const s = new Set(prev); s.delete(key); return s; });
                            } else {
                              // Applica: copia obiettivi del giorno corrente
                              setPiano((prev) => {
                                const updated = { ...prev, [key]: [...prev[editGiorno!]] };
                                atletaIds.forEach((id) => { lsSave(id, settimana, updated); dbSave(id, settimana, updated); });
                                return updated;
                              });
                              setAppliedDays((prev) => new Set(prev).add(key));
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                            isApplied
                              ? "bg-[#C8102E] border-[#C8102E] text-white"
                              : "bg-white border-gray-200 text-gray-600 hover:border-[#C8102E] hover:text-[#C8102E] active:bg-red-50"
                          }`}
                        >
                          {GIORNI_BREVI[idx]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

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
