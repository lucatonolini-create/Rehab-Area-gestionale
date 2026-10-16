"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
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

const GIORNI_BREVI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const;

// Per-day localStorage
function dayLsKey(atletaId: string, date: string) {
  return `piano_day_${atletaId}_${date}`;
}
function dayLoad(atletaId: string, date: string): string[] {
  try {
    const raw = localStorage.getItem(dayLsKey(atletaId, date));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function daySave(atletaId: string, date: string, objs: string[]) {
  try { localStorage.setItem(dayLsKey(atletaId, date), JSON.stringify(objs)); } catch {}
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatLabel(dateStr: string): { giorno: string; num: string; mese: string } {
  const d = new Date(dateStr + "T12:00:00");
  return {
    giorno: GIORNI_BREVI[d.getDay()],
    num: String(d.getDate()),
    mese: String(d.getMonth() + 1).padStart(2, "0"),
  };
}

function buildDates(center: string, before: number, after: number): string[] {
  return Array.from({ length: before + after }, (_, i) =>
    addDays(center, i - before)
  );
}

export default function CalendarioSettimanale({ atleti }: { atleti: Atleta[] }) {
  const atletiAttivi = atleti
    .filter((a) => a.stato === "Infortunato" || a.stato === "NTL")
    .sort((a, b) => nd(a).localeCompare(nd(b), "it"));

  const [atletaId, setAtletaId] = useState<string>("");
  const [dates, setDates] = useState<string[]>(() => buildDates(today(), 7, 28));
  const [plans, setPlans] = useState<Record<string, string[]>>({});
  const [editDate, setEditDate] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  // Ricarica piani quando cambia atleta o elenco date
  useEffect(() => {
    if (!atletaId) { setPlans({}); return; }
    const loaded: Record<string, string[]> = {};
    dates.forEach((d) => { loaded[d] = dayLoad(atletaId, d); });
    setPlans(loaded);
  }, [atletaId, dates]);

  // Scroll automatico su oggi al mount
  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const el = todayRef.current;
      const container = scrollRef.current;
      // Centra oggi nello scroll
      container.scrollLeft = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
    }
  }, []);

  // Estendi le date quando si arriva vicino ai bordi
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollLeft < 120) {
      setDates((prev) => {
        const newDays = Array.from({ length: 14 }, (_, i) => addDays(prev[0], i - 14));
        return [...newDays, ...prev];
      });
    }
    if (el.scrollWidth - el.scrollLeft - el.clientWidth < 120) {
      setDates((prev) => {
        const last = prev[prev.length - 1];
        const newDays = Array.from({ length: 14 }, (_, i) => addDays(last, i + 1));
        return [...prev, ...newDays];
      });
    }
  }, []);

  const toggleObj = useCallback((date: string, code: string) => {
    setPlans((prev) => {
      const curr = prev[date] ?? [];
      const next = curr.includes(code) ? curr.filter((c) => c !== code) : [...curr, code];
      if (atletaId) daySave(atletaId, date, next);
      return { ...prev, [date]: next };
    });
  }, [atletaId]);

  if (atletiAttivi.length === 0) return null;

  const todayStr = today();
  const editObjs = editDate ? (plans[editDate] ?? []) : [];
  const editLabel = editDate ? formatLabel(editDate) : null;

  return (
    <div className="mb-6 pb-6 border-b border-gray-100">
      <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Piano Settimanale
      </h2>

      {/* Dropdown atleta */}
      <div className="mb-3">
        <select
          value={atletaId}
          onChange={(e) => setAtletaId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white text-gray-700"
        >
          <option value="">Seleziona atleta…</option>
          {atletiAttivi.map((a) => (
            <option key={a.id} value={a.id}>
              {nd(a)}{a.stato === "Infortunato" ? " · Infortuno" : " · NTL"}
            </option>
          ))}
        </select>
      </div>

      {/* Strip scorrevole giorni */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {dates.map((date) => {
          const { giorno, num, mese } = formatLabel(date);
          const isToday = date === todayStr;
          const objs = plans[date] ?? [];
          return (
            <button
              key={date}
              ref={isToday ? todayRef : undefined}
              onClick={() => atletaId && setEditDate(date)}
              className={`flex-shrink-0 flex flex-col items-center rounded-xl border transition-all w-[52px] min-h-[80px] ${
                isToday
                  ? "border-[#C8102E] bg-red-50"
                  : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
              }`}
            >
              <p className={`text-[9px] font-bold pt-2 ${isToday ? "text-[#C8102E]" : "text-gray-400"}`}>
                {giorno}
              </p>
              <p className={`text-sm font-bold leading-tight ${isToday ? "text-[#C8102E]" : "text-gray-800"}`}>
                {num}
              </p>
              <p className={`text-[9px] mb-1 ${isToday ? "text-[#C8102E]" : "text-gray-400"}`}>
                .{mese}
              </p>
              <div className="flex flex-col gap-0.5 px-1 pb-2 w-full">
                {objs.length === 0 ? (
                  <span className="text-[9px] text-gray-200 text-center">·</span>
                ) : (
                  objs.map((code) => {
                    const obj = MACRO_OBJ.find((o) => o.code === code);
                    if (!obj) return null;
                    return (
                      <span
                        key={code}
                        className={`${obj.bg} text-white text-[8px] font-bold rounded px-0.5 py-0.5 text-center leading-tight`}
                      >
                        {code}
                      </span>
                    );
                  })
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MACRO_OBJ.map((obj) => (
          <span
            key={obj.code}
            className={`${obj.bg} text-white text-[9px] font-semibold rounded px-1.5 py-0.5 flex items-center gap-1`}
          >
            <span className="font-bold">{obj.code}</span>
            <span className="opacity-80 font-normal">{obj.label}</span>
          </span>
        ))}
      </div>

      {/* Modal modifica giorno */}
      {editDate && editLabel && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          onClick={() => setEditDate(null)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-t-2xl md:rounded-2xl shadow-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 20px)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {editLabel.giorno}{" "}
                <span className="text-gray-400 font-normal text-sm">
                  {editLabel.num}/{editLabel.mese}/{editDate.slice(0, 4)}
                </span>
              </h3>
              <button onClick={() => setEditDate(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MACRO_OBJ.map((obj) => {
                const active = editObjs.includes(obj.code);
                return (
                  <button
                    key={obj.code}
                    onClick={() => toggleObj(editDate, obj.code)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                      active
                        ? `${obj.bg} border-transparent`
                        : "bg-white border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <span className={`text-xs font-bold w-6 shrink-0 ${active ? "text-white" : "text-gray-700"}`}>
                      {obj.code}
                    </span>
                    <span className={`text-xs leading-tight ${active ? "text-white/90" : "text-gray-500"}`}>
                      {obj.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setEditDate(null)}
              className="mt-4 w-full bg-[#C8102E] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-800"
            >
              Fatto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
