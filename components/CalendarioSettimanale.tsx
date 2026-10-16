"use client";

import React, { useState, useEffect, useCallback } from "react";
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
] as const;

const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
const GIORNI_KEYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"] as const;
type GiornoKey = (typeof GIORNI_KEYS)[number];
type PianoGiorni = Record<GiornoKey, string[]>;
const EMPTY_PIANO: PianoGiorni = { lun: [], mar: [], mer: [], gio: [], ven: [], sab: [], dom: [] };

function currentIsoWeek(): string {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const startOfYear = new Date(jan4);
  startOfYear.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.floor((now.getTime() - startOfYear.getTime()) / (7 * 86400000)) + 1;
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function shiftWeek(isoWeek: string, delta: number): string {
  const [year, week] = isoWeek.split("-W").map(Number);
  const jan4 = new Date(year, 0, 4);
  const soy = new Date(jan4);
  soy.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const ref = new Date(soy);
  ref.setDate(soy.getDate() + (week - 1 + delta) * 7);
  const jan4n = new Date(ref.getFullYear(), 0, 4);
  const soyn = new Date(jan4n);
  soyn.setDate(jan4n.getDate() - ((jan4n.getDay() + 6) % 7));
  const wn = Math.floor((ref.getTime() - soyn.getTime()) / (7 * 86400000)) + 1;
  return `${ref.getFullYear()}-W${String(wn).padStart(2, "0")}`;
}

function isoWeekDates(isoWeek: string): string[] {
  const [year, week] = isoWeek.split("-W").map(Number);
  const jan4 = new Date(year, 0, 4);
  const sow = new Date(jan4);
  sow.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sow);
    d.setDate(sow.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

function lsKey(atletaId: string, settimana: string) {
  return `piano_sett_${atletaId}_${settimana}`;
}
function lsLoad(atletaId: string, settimana: string): PianoGiorni {
  try {
    const raw = localStorage.getItem(lsKey(atletaId, settimana));
    return raw ? { ...EMPTY_PIANO, ...JSON.parse(raw) } : { ...EMPTY_PIANO };
  } catch { return { ...EMPTY_PIANO }; }
}
function lsSave(atletaId: string, settimana: string, piano: PianoGiorni) {
  try { localStorage.setItem(lsKey(atletaId, settimana), JSON.stringify(piano)); } catch {}
}

export default function CalendarioSettimanale({ atleti }: { atleti: Atleta[] }) {
  const atletiAttivi = atleti
    .filter((a) => a.stato === "Infortunato" || a.stato === "NTL")
    .sort((a, b) => nd(a).localeCompare(nd(b), "it"));

  const [atletaId, setAtletaId] = useState<string>("");
  const [settimana, setSettimana] = useState(currentIsoWeek);
  const [piano, setPiano] = useState<PianoGiorni>({ ...EMPTY_PIANO });
  const [editGiorno, setEditGiorno] = useState<GiornoKey | null>(null);

  useEffect(() => {
    if (atletaId) setPiano(lsLoad(atletaId, settimana));
  }, [atletaId, settimana]);

  const toggleObj = useCallback((giorno: GiornoKey, code: string) => {
    setPiano((prev) => {
      const curr = prev[giorno];
      const next = curr.includes(code) ? curr.filter((c) => c !== code) : [...curr, code];
      const updated = { ...prev, [giorno]: next };
      if (atletaId) lsSave(atletaId, settimana, updated);
      return updated;
    });
  }, [atletaId, settimana]);

  if (atletiAttivi.length === 0) return null;

  const weekDates = isoWeekDates(settimana);
  const today = new Date().toISOString().slice(0, 10);
  const editIdx = editGiorno ? GIORNI_KEYS.indexOf(editGiorno) : -1;

  return (
    <div className="mb-6 pb-6 border-b border-gray-100">
      <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Piano Settimanale
      </h2>

      {/* Dropdown atleta + navigazione settimana */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={atletaId}
          onChange={(e) => setAtletaId(e.target.value)}
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white text-gray-700"
        >
          <option value="">Seleziona atleta…</option>
          {atletiAttivi.map((a) => (
            <option key={a.id} value={a.id}>
              {nd(a)}{a.stato === "Infortunato" ? " · Infortuno" : " · NTL"}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setSettimana((w) => shiftWeek(w, -1))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <span className="text-[10px] text-gray-600 font-medium px-2 text-center w-[90px] leading-tight">
            {weekDates[0].slice(8)}.{weekDates[0].slice(5,7)}
            {" – "}
            {weekDates[6].slice(8)}.{weekDates[6].slice(5,7)}.{weekDates[6].slice(2,4)}
          </span>
          <button
            onClick={() => setSettimana((w) => shiftWeek(w, 1))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Griglia settimanale */}
      <div className="grid grid-cols-7 gap-1">
        {GIORNI_BREVI.map((label, i) => {
          const key = GIORNI_KEYS[i];
          const date = weekDates[i];
          const isToday = date === today;
          const objs = piano[key];
          return (
            <button
              key={key}
              onClick={() => atletaId && setEditGiorno(key)}
              className={`flex flex-col items-center rounded-xl border transition-all min-h-[76px] ${
                isToday
                  ? "border-[#C8102E] bg-red-50"
                  : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
              }`}
            >
              <p className={`text-[10px] font-bold pt-2 ${isToday ? "text-[#C8102E]" : "text-gray-400"}`}>
                {label}
              </p>
              <p className={`text-[10px] font-semibold mb-1.5 ${isToday ? "text-[#C8102E]" : "text-gray-500"}`}>
                {date.slice(8)}
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
                        className={`${obj.bg} text-white text-[9px] font-bold rounded px-0.5 py-0.5 text-center leading-tight`}
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
      {editGiorno && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          onClick={() => setEditGiorno(null)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-t-2xl md:rounded-2xl shadow-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 20px)" }}
          >
            <div className="flex items-center justify-between mb-4">
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
            <div className="grid grid-cols-2 gap-2">
              {MACRO_OBJ.map((obj) => {
                const active = piano[editGiorno].includes(obj.code);
                return (
                  <button
                    key={obj.code}
                    onClick={() => toggleObj(editGiorno, obj.code)}
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
              onClick={() => setEditGiorno(null)}
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
