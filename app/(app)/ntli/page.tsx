"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Plus, X, Printer, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  loadNtli, upsertNtli, deleteNtli,
  loadNtliDaily, upsertNtliDaily,
  loadAtleti,
  searchOsiicsCodes,
  type NtliRecord, type NtliDaily, type NtliStato, type TrainingModification, type Atleta, type OsiicsCode,
  NTLI_STATI, TRAINING_MODIFICATIONS,
} from "@/lib/store";
import PlayerCombobox from "@/components/PlayerCombobox";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

function isoWeekDates(isoWeek: string): string[] {
  const [year, week] = isoWeek.split("-W").map(Number);
  const jan4 = new Date(year, 0, 4);
  const startOfWeek = new Date(jan4);
  startOfWeek.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function currentIsoWeek(): string {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const startOfYear = new Date(jan4);
  startOfYear.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.floor((now.getTime() - startOfYear.getTime()) / (7 * 86400000)) + 1;
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function shiftWeek(isoWeek: string, delta: number): string {
  const dates = isoWeekDates(isoWeek);
  const ref = new Date(dates[0]);
  ref.setDate(ref.getDate() + delta * 7);
  const jan4 = new Date(ref.getFullYear(), 0, 4);
  const startOfYear = new Date(jan4);
  startOfYear.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.floor((ref.getTime() - startOfYear.getTime()) / (7 * 86400000)) + 1;
  return `${ref.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const LATI = ["Sinistro", "Destro", "Bilaterale", "Non applicabile"];

const statusColor: Record<NtliStato, string> = {
  "Attivo": "bg-blue-100 text-blue-700",
  "In miglioramento": "bg-green-100 text-green-700",
  "Stabile": "bg-yellow-100 text-yellow-700",
  "Peggiorato": "bg-red-100 text-red-700",
  "Risolto": "bg-gray-100 text-gray-600",
  "Chiuso": "bg-gray-100 text-gray-400",
};

function vasBadge(vas: number | null | undefined): string {
  if (vas == null) return "bg-gray-100 text-gray-500";
  if (vas <= 1) return "bg-green-100 text-green-700";
  if (vas <= 4) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function Sel(p: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return <select {...p} className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white ${p.className ?? ""}`} />;
}
function Inp(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] ${p.className ?? ""}`} />;
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{children}</label>;
}

// ── VAS Slider ───────────────────────────────────────────────────────────────
function VasInput({ value, onChange, disabled }: { value: number | null | undefined; onChange: (v: number | null) => void; disabled?: boolean }) {
  const num = value ?? "";
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={0} max={10} step={0.5} value={value ?? 0}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[#C8102E]" />
      <input type="number" min={0} max={10} step={0.5} value={num}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
        className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
    </div>
  );
}


// ── OSIICS Autocomplete ──────────────────────────────────────────────────────
function OsiicsField({ value, description, onChange }: {
  value: string; description: string;
  onChange: (code: string, desc: string) => void;
}) {
  const [query, setQuery] = useState(value ? `${value} - ${description}` : "");
  const [results, setResults] = useState<OsiicsCode[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const res = await searchOsiicsCodes(q);
      setResults(res);
      setOpen(res.length > 0);
    }, 300);
  };

  return (
    <div className="relative">
      <Inp value={query} onChange={(e) => handleChange(e.target.value)}
        placeholder="Cerca codice o descrizione (min 2 caratteri)..."
        onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {open && (
        <div className="absolute z-50 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto mt-1">
          {results.map((r) => (
            <button key={r.id} type="button" onMouseDown={() => {
              onChange(r.codice, r.descrizioneIta);
              setQuery(`${r.codice} - ${r.descrizioneIta}`);
              setOpen(false);
            }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
              <span className="font-mono font-bold text-[#C8102E] mr-2">{r.codice}</span>
              {r.descrizioneIta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VAS Chart SVG ────────────────────────────────────────────────────────────
function VasChart({ days, dailyMap }: { days: string[]; dailyMap: Map<string, NtliDaily> }) {
  const W = 600, H = 200, PAD = { top: 16, right: 20, bottom: 32, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xPos = (i: number) => PAD.left + (i / 6) * innerW;
  const yPos = (v: number) => PAD.top + innerH - (v / 10) * innerH;

  const startPoints = days.map((d, i) => {
    const rec = dailyMap.get(d);
    if (!rec || rec.vasStart == null) return null;
    return { x: xPos(i), y: yPos(rec.vasStart), v: rec.vasStart };
  });
  const endPoints = days.map((d, i) => {
    const rec = dailyMap.get(d);
    if (!rec || rec.vasEnd == null) return null;
    return { x: xPos(i), y: yPos(rec.vasEnd), v: rec.vasEnd };
  });

  function buildPath(points: (null | { x: number; y: number })[]) {
    let d = "";
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p) { d += " "; continue; }
      const prev = points.slice(0, i).reverse().find(Boolean);
      if (!prev || d.trim() === "") d += `M ${p.x} ${p.y}`;
      else if (i > 0 && points[i - 1]) d += ` L ${p.x} ${p.y}`;
      else d += ` M ${p.x} ${p.y}`;
    }
    return d;
  }

  const hasData = startPoints.some(Boolean) || endPoints.some(Boolean);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Ref lines */}
        <line x1={PAD.left} x2={W - PAD.right} y1={yPos(3)} y2={yPos(3)} stroke="#F59E0B" strokeWidth={1} strokeDasharray="4,4" />
        <line x1={PAD.left} x2={W - PAD.right} y1={yPos(5)} y2={yPos(5)} stroke="#EF4444" strokeWidth={1} strokeDasharray="4,4" />
        <text x={PAD.left - 4} y={yPos(3) + 4} textAnchor="end" fontSize={9} fill="#F59E0B">3</text>
        <text x={PAD.left - 4} y={yPos(5) + 4} textAnchor="end" fontSize={9} fill="#EF4444">5</text>
        {/* Y axis labels */}
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={PAD.left - 3} x2={PAD.left} y1={yPos(v)} y2={yPos(v)} stroke="#9CA3AF" strokeWidth={1} />
            <text x={PAD.left - 5} y={yPos(v) + 4} textAnchor="end" fontSize={9} fill="#9CA3AF">{v}</text>
          </g>
        ))}
        {/* X axis labels */}
        {days.map((_, i) => (
          <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="#6B7280">{GIORNI_BREVI[i]}</text>
        ))}
        {/* Axes */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="#E5E7EB" strokeWidth={1} />
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#E5E7EB" strokeWidth={1} />

        {!hasData && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#9CA3AF">Nessun dato questa settimana</text>
        )}

        {/* Lines */}
        <path d={buildPath(startPoints)} fill="none" stroke="#2563EB" strokeWidth={2} strokeLinejoin="round" />
        <path d={buildPath(endPoints)} fill="none" stroke="#C8102E" strokeWidth={2} strokeLinejoin="round" />

        {/* Points */}
        {startPoints.map((p, i) => p && (
          <circle key={`s${i}`} cx={p.x} cy={p.y} r={4} fill="#2563EB" />
        ))}
        {endPoints.map((p, i) => p && (
          <circle key={`e${i}`} cx={p.x} cy={p.y} r={4} fill="#C8102E" />
        ))}
      </svg>
      <div className="flex gap-4 text-xs text-gray-500 mt-1 justify-center">
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-[#2563EB]" /> VAS inizio</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-[#C8102E]" /> VAS fine</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-yellow-400" style={{ borderTop: "1px dashed" }} /> Soglia 3</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-red-400" style={{ borderTop: "1px dashed" }} /> Soglia 5</span>
      </div>
    </div>
  );
}

// ── NTLI Form (modale) ───────────────────────────────────────────────────────
interface NtliFormData {
  athleteId: string;
  athleteName: string;
  onsetDate: string;
  osiicsCode: string;
  osiicsDescription: string;
  painLocation: string;
  bodySide: string;
  clinicalDiagnosis: string;
  status: NtliStato;
  notes: string;
}

function NtliForm({
  initial, onSave, onCancel,
}: {
  initial?: NtliRecord;
  onSave: (data: NtliFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NtliFormData>({
    athleteId: initial?.athleteId ?? "",
    athleteName: initial?.athleteName ?? "",
    onsetDate: initial?.onsetDate ?? today(),
    osiicsCode: initial?.osiicsCode ?? "",
    osiicsDescription: initial?.osiicsDescription ?? "",
    painLocation: initial?.painLocation ?? "",
    bodySide: initial?.bodySide ?? "Sinistro",
    clinicalDiagnosis: initial?.clinicalDiagnosis ?? "",
    status: initial?.status ?? "Attivo",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const f = <K extends keyof NtliFormData>(k: K, v: NtliFormData[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{initial ? "Modifica NTLI" : "Nuovo NTLI"}</h2>
          <button onClick={onCancel}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <Lbl>Giocatore *</Lbl>
            <div className="mt-1">
              <PlayerCombobox
                value={form.athleteName}
                onSelect={(nome) => { f("athleteName", nome); f("athleteId", ""); }}
                placeholder="Cerca giocatore..."
              />
            </div>
          </div>
          <div>
            <Lbl>Data insorgenza *</Lbl>
            <div className="mt-1 w-full border border-gray-200 rounded-xl px-4 focus-within:ring-2 focus-within:ring-[#C8102E]">
              <input type="date" value={form.onsetDate} onChange={(e) => f("onsetDate", e.target.value)}
                className="w-full py-3 text-sm bg-transparent border-0 outline-none" />
            </div>
          </div>
          <div>
            <Lbl>Sede del dolore *</Lbl>
            <Inp className="mt-1" value={form.painLocation} onChange={(e) => f("painLocation", e.target.value)} placeholder="Es. Ginocchio destro" />
          </div>
          <div>
            <Lbl>Lato *</Lbl>
            <Sel className="mt-1" value={form.bodySide} onChange={(e) => f("bodySide", e.target.value)}>
              {LATI.map((l) => <option key={l}>{l}</option>)}
            </Sel>
          </div>
          <div>
            <Lbl>Classificazione OSIICS</Lbl>
            <div className="mt-1">
              <OsiicsField value={form.osiicsCode} description={form.osiicsDescription}
                onChange={(code, desc) => { f("osiicsCode", code); f("osiicsDescription", desc); }} />
            </div>
          </div>
          <div>
            <Lbl>Diagnosi / Descrizione clinica</Lbl>
            <textarea value={form.clinicalDiagnosis} onChange={(e) => f("clinicalDiagnosis", e.target.value)}
              rows={3} placeholder="Descrizione clinica..."
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none" />
          </div>
          <div>
            <Lbl>Stato</Lbl>
            <Sel className="mt-1" value={form.status} onChange={(e) => f("status", e.target.value as NtliStato)}>
              {NTLI_STATI.map((s) => <option key={s}>{s}</option>)}
            </Sel>
          </div>
          <div>
            <Lbl>Note iniziali</Lbl>
            <textarea value={form.notes} onChange={(e) => f("notes", e.target.value)}
              rows={2} placeholder="Note..."
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none" />
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onCancel}
            className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
            Annulla
          </button>
          <button
            disabled={!form.athleteName.trim() || !form.painLocation || saving}
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-xl text-sm font-medium hover:bg-red-800 disabled:opacity-40">
            {saving ? "Salvataggio..." : initial ? "Salva modifiche" : "Crea NTLI"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Chiudi NTLI modal ────────────────────────────────────────────────────────
function ChiudiModal({ ntli, onChiudi, onCancel }: {
  ntli: NtliRecord;
  onChiudi: (endDate: string, status: NtliStato, note: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [endDate, setEndDate] = useState(today());
  const [status, setStatus] = useState<NtliStato>("Risolto");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Chiudi NTLI</h2>
          <button onClick={onCancel}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Atleta: <strong>{ntli.athleteName}</strong> — {ntli.painLocation}</p>
          <div>
            <Lbl>Data di risoluzione</Lbl>
            <div className="mt-1 w-full border border-gray-200 rounded-xl px-4 focus-within:ring-2 focus-within:ring-[#C8102E]">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full py-3 text-sm bg-transparent border-0 outline-none" />
            </div>
          </div>
          <div>
            <Lbl>Stato finale</Lbl>
            <Sel className="mt-1" value={status} onChange={(e) => setStatus(e.target.value as NtliStato)}>
              <option>Risolto</option>
              <option>Chiuso</option>
            </Sel>
          </div>
          <div>
            <Lbl>Nota conclusiva</Lbl>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-[#C8102E]" />
            Confermo che non sono necessarie ulteriori rilevazioni
          </label>
        </div>
        <div className="flex gap-3 p-6 border-t border-gray-100">
          <button onClick={onCancel}
            className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
            Annulla
          </button>
          <button disabled={!confirmed || saving}
            onClick={async () => { setSaving(true); await onChiudi(endDate, status, note); setSaving(false); }}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-xl text-sm font-medium hover:bg-red-800 disabled:opacity-40">
            {saving ? "Chiusura..." : "Chiudi NTLI"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function NtliPage() {
  const [ntliList, setNtliList] = useState<NtliRecord[]>([]);
  const [dailyAll, setDailyAll] = useState<NtliDaily[]>([]);
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "monitoraggio" | "riepilogo" | "gestione">("dashboard");

  // Dashboard
  const [showNuovoForm, setShowNuovoForm] = useState(false);

  // Monitoraggio
  const [monDate, setMonDate] = useState(today());
  const [monAtleta, setMonAtleta] = useState("");
  const [monEdits, setMonEdits] = useState<Record<string, Partial<NtliDaily>>>({});
  const [monSaving, setMonSaving] = useState(false);
  const [monMsg, setMonMsg] = useState<string | null>(null);

  // Riepilogo
  const [week, setWeek] = useState(currentIsoWeek());

  // Gestione
  const [gestFiltro, setGestFiltro] = useState<NtliStato | "Tutti">("Tutti");
  const [editNtli, setEditNtli] = useState<NtliRecord | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [chiudiNtli, setChiudiNtli] = useState<NtliRecord | null>(null);

  const reload = useCallback(async () => {
    const [nl, dl, al] = await Promise.all([loadNtli(), loadNtliDaily(), loadAtleti()]);
    setNtliList(nl);
    setDailyAll(dl);
    setAtleti(al);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeNtli = ntliList.filter((n) => n.status !== "Risolto" && n.status !== "Chiuso");
  const todayStr = today();

  const todayDaily = dailyAll.filter((d) => d.date === todayStr);
  const compiledToday = new Set(todayDaily.map((d) => d.ntliId));
  const toCompileToday = activeNtli.filter((n) => !compiledToday.has(n.id));
  const highVasToday = activeNtli.filter((n) => {
    const rec = todayDaily.find((d) => d.ntliId === n.id);
    return rec && rec.vasEnd != null && rec.vasEnd >= 5;
  });

  const weekDates = isoWeekDates(week);
  const weekDaily = dailyAll.filter((d) => weekDates.includes(d.date));

  // Peggioramento: ultima VAS fine > prima VAS fine nella settimana
  const peggiorati = activeNtli.filter((n) => {
    const recs = weekDaily.filter((d) => d.ntliId === n.id && d.vasEnd != null).sort((a, b) => a.date.localeCompare(b.date));
    if (recs.length < 2) return false;
    return (recs[recs.length - 1].vasEnd ?? 0) > (recs[0].vasEnd ?? 0);
  });

  // ── Monitoraggio helpers ──────────────────────────────────────────────────
  function getMonRow(ntliId: string): Partial<NtliDaily> {
    const existing = dailyAll.find((d) => d.ntliId === ntliId && d.date === monDate);
    return monEdits[ntliId] ?? (existing ? existing : { trainingModification: "Nessuna modifica" as TrainingModification });
  }

  function setMonRow(ntliId: string, patch: Partial<NtliDaily>) {
    setMonEdits((p) => ({
      ...p,
      [ntliId]: { ...getMonRow(ntliId), ...patch },
    }));
  }

  async function saveMonitoraggio() {
    setMonSaving(true);
    setMonMsg(null);
    try {
      const toSave = Object.entries(monEdits);
      if (toSave.length === 0) { setMonMsg("Nessuna modifica da salvare."); setMonSaving(false); return; }
      for (const [ntliId, patch] of toSave) {
        const ntli = ntliList.find((n) => n.id === ntliId);
        if (!ntli) continue;
        const existing = dailyAll.find((d) => d.ntliId === ntliId && d.date === monDate);
        const record: NtliDaily = {
          id: existing?.id ?? uid(),
          ntliId,
          athleteId: ntli.athleteId,
          date: monDate,
          vasStart: patch.vasStart ?? existing?.vasStart ?? null,
          vasEnd: patch.vasEnd ?? existing?.vasEnd ?? null,
          trainingModification: patch.trainingModification ?? existing?.trainingModification ?? "Nessuna modifica",
          note: patch.note ?? existing?.note ?? "",
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await upsertNtliDaily(record);
      }
      await reload();
      setMonEdits({});
      setMonMsg("Monitoraggio salvato correttamente.");
    } catch (e) {
      setMonMsg("Errore nel salvataggio: " + String(e));
    }
    setMonSaving(false);
  }

  // ── Gestione helpers ──────────────────────────────────────────────────────
  async function handleSaveNtli(data: NtliFormData) {
    const now = new Date().toISOString();
    const rec: NtliRecord = {
      id: editNtli?.id ?? uid(),
      athleteId: data.athleteId,
      athleteName: data.athleteName,
      onsetDate: data.onsetDate,
      osiicsCode: data.osiicsCode || undefined,
      osiicsDescription: data.osiicsDescription || undefined,
      painLocation: data.painLocation,
      bodySide: data.bodySide,
      clinicalDiagnosis: data.clinicalDiagnosis || undefined,
      status: data.status,
      notes: data.notes || undefined,
      createdAt: editNtli?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertNtli(rec);
    await reload();
    setShowForm(false);
    setEditNtli(undefined);
  }

  async function handleChiudiNtli(endDate: string, status: NtliStato, note: string) {
    if (!chiudiNtli) return;
    const updated: NtliRecord = {
      ...chiudiNtli,
      endDate,
      status,
      notes: note ? (chiudiNtli.notes ? chiudiNtli.notes + "\n" + note : note) : chiudiNtli.notes,
      updatedAt: new Date().toISOString(),
    };
    await upsertNtli(updated);
    await reload();
    setChiudiNtli(null);
  }

  async function handleRiapri(n: NtliRecord) {
    await upsertNtli({ ...n, status: "Attivo", endDate: undefined, updatedAt: new Date().toISOString() });
    await reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminare questo NTLI e tutte le rilevazioni associate?")) return;
    await deleteNtli(id);
    await reload();
  }

  // ── Riepilogo stats ───────────────────────────────────────────────────────
  function weekStats(ntliId: string) {
    const recs = weekDaily.filter((d) => d.ntliId === ntliId).sort((a, b) => a.date.localeCompare(b.date));
    if (recs.length === 0) return null;
    const starts = recs.filter((r) => r.vasStart != null).map((r) => r.vasStart as number);
    const ends = recs.filter((r) => r.vasEnd != null).map((r) => r.vasEnd as number);
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const mods = recs.map((r) => r.trainingModification);
    const modCount: Record<string, number> = {};
    mods.forEach((m) => { modCount[m] = (modCount[m] ?? 0) + 1; });
    const mainMod = Object.entries(modCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    const avgStart = avg(starts);
    const avgEnd = avg(ends);
    let trend: "Miglioramento" | "Peggioramento" | "Stabile" | "Dati insufficienti" = "Dati insufficienti";
    if (ends.length >= 2) {
      const first = ends[0], last = ends[ends.length - 1];
      if (last < first - 0.5) trend = "Miglioramento";
      else if (last > first + 0.5) trend = "Peggioramento";
      else trend = "Stabile";
    }
    return {
      giorni: recs.length,
      avgStart, avgEnd,
      max: ends.length ? Math.max(...ends) : null,
      min: ends.length ? Math.min(...ends) : null,
      lastVas: ends.length ? ends[ends.length - 1] : null,
      mainMod, trend,
    };
  }

  const monNtli = activeNtli.filter((n) => !monAtleta || n.athleteId === monAtleta);

  const riepilogoNtli = ntliList.filter((n) => {
    const hasData = weekDaily.some((d) => d.ntliId === n.id);
    return (n.status !== "Risolto" && n.status !== "Chiuso") || hasData;
  });

  // Aggregato squadra
  const squadraData = weekDates.map((d) => {
    const recs = weekDaily.filter((r) => r.date === d && r.vasEnd != null);
    if (recs.length === 0) return { date: d, avgVas: null, count: 0 };
    const avg = recs.reduce((a, r) => a + (r.vasEnd ?? 0), 0) / recs.length;
    return { date: d, avgVas: avg, count: recs.length };
  });

  const modTotali: Record<string, number> = {};
  weekDaily.forEach((d) => { modTotali[d.trainingModification] = (modTotali[d.trainingModification] ?? 0) + 1; });
  const modMax = Math.max(...Object.values(modTotali), 1);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Caricamento...</div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 11px; }
          .page-break { page-break-before: always; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">NTLI — Non-Time-Loss Injuries</h1>
            <p className="text-sm text-gray-500 mt-0.5">Monitoraggio infortuni senza perdita di tempo</p>
          </div>
          <button onClick={() => { setEditNtli(undefined); setShowForm(true); }}
            className="flex items-center gap-2 bg-[#C8102E] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-800">
            <Plus className="w-4 h-4" /> Nuovo NTLI
          </button>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto mb-6 no-print -mx-4 px-4">
          <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1 shadow-sm min-w-max">
            {([
              ["dashboard",    "Dashboard",    "Dashboard"],
              ["monitoraggio", "Monitoraggio", "Monitoraggio giornaliero"],
              ["riepilogo",    "Riepilogo",    "Riepilogo settimanale"],
              ["gestione",     "Gestione",     "Gestione NTLI"],
            ] as const).map(([key, short, full]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`py-2 px-4 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${tab === key ? "bg-[#C8102E] text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                <span className="md:hidden">{short}</span>
                <span className="hidden md:inline">{full}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Dashboard ─────────────────────────────────────────────── */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            {/* KPI */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {[
                { label: "NTLI attivi",     short: "Attivi",        value: activeNtli.length,       color: "text-blue-600"  },
                { label: "Da compilare",    short: "Da compilare",  value: toCompileToday.length,   color: "text-yellow-600"},
                { label: "Compilati oggi",  short: "Compilati",     value: compiledToday.size,      color: "text-green-600" },
                { label: "VAS fine ≥5",     short: "VAS ≥5",        value: highVasToday.length,     color: "text-red-600"   },
                { label: "In peggioramento",short: "Peggioram.",    value: peggiorati.length,       color: "text-red-800"   },
              ].map((k) => (
                <div key={k.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 md:p-5">
                  <p className={`text-2xl md:text-3xl font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-tight">
                    <span className="md:hidden">{k.short}</span>
                    <span className="hidden md:inline">{k.label}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Lista NTLI attivi */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-base font-bold text-gray-900 mb-4">NTLI Attivi</h2>
              {activeNtli.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nessun NTLI attivo</p>
              ) : (
                <div className="space-y-2">
                  {activeNtli.map((n) => {
                    const lastRec = dailyAll.filter((d) => d.ntliId === n.id).sort((a, b) => b.date.localeCompare(a.date))[0];
                    return (
                      <div key={n.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                        <div className="flex items-center gap-3 min-w-0">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{n.athleteName}</p>
                            <p className="text-xs text-gray-500">{n.painLocation} · {n.bodySide}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {lastRec?.vasEnd != null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vasBadge(lastRec.vasEnd)}`}>
                              VAS {lastRec.vasEnd}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[n.status]}`}>{n.status}</span>
                          <button onClick={() => setTab("monitoraggio")}
                            className="text-xs text-[#C8102E] border border-[#C8102E] px-2 py-1 rounded-lg hover:bg-red-50">
                            Vai al monitoraggio
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab Monitoraggio ──────────────────────────────────────────── */}
        {tab === "monitoraggio" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 no-print">
              <div className="flex items-center gap-2">
                <Lbl>Data</Lbl>
                <div className="border border-gray-200 rounded-xl px-3 focus-within:ring-2 focus-within:ring-[#C8102E]">
                  <input type="date" value={monDate} onChange={(e) => setMonDate(e.target.value)}
                    className="py-2 text-sm bg-transparent border-0 outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Lbl>Atleta</Lbl>
                <select value={monAtleta} onChange={(e) => setMonAtleta(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                  <option value="">Tutti</option>
                  {atleti.filter((a) => activeNtli.some((n) => n.athleteId === a.id)).map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {monNtli.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
                Nessun NTLI attivo da monitorare
              </div>
            ) : (
              <div className="space-y-3">
                {monNtli.map((ntli) => {
                  const row = getMonRow(ntli.id);
                  const existing = dailyAll.find((d) => d.ntliId === ntli.id && d.date === monDate);
                  const isCompilato = !!existing && !monEdits[ntli.id];
                  const noAllenamento = (row.trainingModification ?? "").split(",").map(s => s.trim()).includes("Nessun allenamento");

                  return (
                    <div key={ntli.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="font-semibold text-gray-900">{ntli.athleteName}</p>
                          <p className="text-xs text-gray-500">{ntli.painLocation} · {ntli.bodySide}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${isCompilato ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {isCompilato ? "Compilato" : "Da compilare"}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {/* Modifica allenamento — multi-select */}
                        <div>
                          <Lbl>Modifica allenamento</Lbl>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {TRAINING_MODIFICATIONS.map((m) => {
                              const current = row.trainingModification ?? "Nessuna modifica";
                              const selected = current.split(",").map(s => s.trim());
                              const active = selected.includes(m);
                              const toggle = () => {
                                let next: string[];
                                if (m === "Nessuna modifica" || m === "Nessun allenamento") {
                                  // esclusivi: se già attivo deseleziona, altrimenti sostituisce tutto
                                  next = active ? [] : [m];
                                } else {
                                  // rimuovi i valori esclusivi e aggiungi/rimuovi questo
                                  const base = selected.filter(s => s !== "Nessuna modifica" && s !== "Nessun allenamento");
                                  next = active ? base.filter(s => s !== m) : [...base, m];
                                }
                                setMonRow(ntli.id, {
                                  trainingModification: (next.length ? next.join(", ") : "Nessuna modifica") as TrainingModification,
                                });
                              };
                              return (
                                <button key={m} type="button"
                                  onClick={toggle}
                                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                    active
                                      ? "bg-[#C8102E] text-white border-[#C8102E]"
                                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                                  }`}>
                                  {m}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Lbl>VAS Inizio allenamento {noAllenamento ? "(opzionale)" : ""}</Lbl>
                            <div className="mt-2">
                              <VasInput value={row.vasStart ?? null} disabled={false}
                                onChange={(v) => setMonRow(ntli.id, { vasStart: v })} />
                            </div>
                          </div>
                          <div>
                            <Lbl>VAS Fine allenamento {noAllenamento ? "(opzionale)" : ""}</Lbl>
                            <div className="mt-2">
                              <VasInput value={row.vasEnd ?? null} disabled={false}
                                onChange={(v) => setMonRow(ntli.id, { vasEnd: v })} />
                            </div>
                          </div>
                        </div>

                        <div>
                          <Lbl>Note (max 300 caratteri)</Lbl>
                          <input type="text" maxLength={300} value={row.note ?? ""}
                            onChange={(e) => setMonRow(ntli.id, { note: e.target.value })}
                            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                            placeholder="Note..." />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-2">
                  {monMsg && <p className="text-sm text-gray-600">{monMsg}</p>}
                  <button onClick={saveMonitoraggio} disabled={monSaving}
                    className="ml-auto bg-[#C8102E] text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-red-800 disabled:opacity-40">
                    {monSaving ? "Salvataggio..." : "Salva monitoraggio"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab Riepilogo settimanale ─────────────────────────────────── */}
        {tab === "riepilogo" && (
          <div className="space-y-6">
            {/* Week selector */}
            <div className="flex items-center gap-3 no-print">
              <button onClick={() => setWeek(shiftWeek(week, -1))}
                className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="border border-gray-200 rounded-xl px-3 focus-within:ring-2 focus-within:ring-[#C8102E]">
                <input type="week" value={week} onChange={(e) => setWeek(e.target.value)}
                  className="py-2 text-sm bg-transparent border-0 outline-none" />
              </div>
              <button onClick={() => setWeek(shiftWeek(week, 1))}
                className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50">
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-500">{weekDates[0]} — {weekDates[6]}</span>
            </div>

            {/* Card per ogni NTLI */}
            {riepilogoNtli.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
                Nessun NTLI con dati in questa settimana
              </div>
            ) : (
              riepilogoNtli.map((n) => {
                const stats = weekStats(n.id);
                const dailyMap = new Map(weekDates.map((d) => {
                  const rec = weekDaily.find((r) => r.ntliId === n.id && r.date === d);
                  return [d, rec!];
                }));
                return (
                  <div key={n.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-bold text-gray-900">{n.athleteName}</p>
                        <p className="text-sm text-gray-500">{n.painLocation} · {n.bodySide}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[n.status]}`}>{n.status}</span>
                        <button onClick={() => window.print()}
                          className="no-print p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-400">
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {!stats ? (
                      <p className="text-sm text-gray-400 text-center py-6">Nessun dato questa settimana</p>
                    ) : (
                      <>
                        {/* Tabella stats */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                          {[
                            { label: "Giorni monit.", value: stats.giorni },
                            { label: "Media VAS inizio", value: stats.avgStart?.toFixed(1) ?? "—" },
                            { label: "Media VAS fine", value: stats.avgEnd?.toFixed(1) ?? "—" },
                            { label: "VAS max", value: stats.max?.toFixed(1) ?? "—" },
                            { label: "VAS min", value: stats.min?.toFixed(1) ?? "—" },
                            { label: "Ultima VAS", value: stats.lastVas?.toFixed(1) ?? "—" },
                          ].map((s) => (
                            <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                              <p className="text-lg font-bold text-gray-900">{s.value}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-sm text-gray-500">Andamento:</span>
                          <span className={`text-sm font-semibold ${
                            stats.trend === "Miglioramento" ? "text-green-600" :
                            stats.trend === "Peggioramento" ? "text-red-600" :
                            stats.trend === "Stabile" ? "text-yellow-600" : "text-gray-400"
                          }`}>{stats.trend}</span>
                          <span className="text-sm text-gray-500 ml-4">Principale modifica: <strong>{stats.mainMod}</strong></span>
                        </div>

                        {/* Grafico SVG */}
                        <VasChart days={weekDates} dailyMap={dailyMap} />
                      </>
                    )}
                  </div>
                );
              })
            )}

            {/* Aggregato squadra */}
            {riepilogoNtli.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h2 className="text-base font-bold text-gray-900 mb-4">Aggregato Squadra</h2>
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {squadraData.map((s, i) => (
                    <div key={s.date} className="text-center">
                      <p className="text-xs text-gray-400 mb-1">{GIORNI_BREVI[i]}</p>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className={`text-sm font-bold ${s.avgVas == null ? "text-gray-300" : s.avgVas >= 5 ? "text-red-600" : s.avgVas >= 3 ? "text-yellow-600" : "text-green-600"}`}>
                          {s.avgVas == null ? "—" : s.avgVas.toFixed(1)}
                        </p>
                        <p className="text-xs text-gray-400">{s.count} NTLI</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bar chart modifiche */}
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribuzione modifiche allenamento</h3>
                <div className="space-y-2">
                  {TRAINING_MODIFICATIONS.map((m) => {
                    const count = modTotali[m] ?? 0;
                    const pct = (count / modMax) * 100;
                    return (
                      <div key={m} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-36 shrink-0">{m}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-[#C8102E]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab Gestione ──────────────────────────────────────────────── */}
        {tab === "gestione" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-gray-400" />
              <select value={gestFiltro} onChange={(e) => setGestFiltro(e.target.value as NtliStato | "Tutti")}
                className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                <option value="Tutti">Tutti gli stati</option>
                {NTLI_STATI.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                    <th className="text-left px-4 py-3">Atleta</th>
                    <th className="text-left px-4 py-3">Sede</th>
                    <th className="text-left px-4 py-3">Lato</th>
                    <th className="text-left px-4 py-3">Insorgenza</th>
                    <th className="text-left px-4 py-3">Stato</th>
                    <th className="text-left px-4 py-3">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {ntliList
                    .filter((n) => gestFiltro === "Tutti" || n.status === gestFiltro)
                    .map((n) => (
                      <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{n.athleteName}</td>
                        <td className="px-4 py-3 text-gray-600">{n.painLocation}</td>
                        <td className="px-4 py-3 text-gray-500">{n.bodySide}</td>
                        <td className="px-4 py-3 text-gray-500">{n.onsetDate}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[n.status]}`}>{n.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setEditNtli(n); setShowForm(true); }}
                              className="text-xs text-blue-600 hover:underline">Modifica</button>
                            {(n.status !== "Risolto" && n.status !== "Chiuso") ? (
                              <button onClick={() => setChiudiNtli(n)}
                                className="text-xs text-orange-600 hover:underline">Chiudi</button>
                            ) : (
                              <button onClick={() => handleRiapri(n)}
                                className="text-xs text-green-600 hover:underline">Riapri</button>
                            )}
                            <button onClick={() => handleDelete(n.id)}
                              className="text-xs text-red-400 hover:underline">Elimina</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {ntliList.filter((n) => gestFiltro === "Tutti" || n.status === gestFiltro).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-400">Nessun NTLI trovato</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modali */}
      {(showForm || showNuovoForm) && (
        <NtliForm
          initial={editNtli}
          onSave={handleSaveNtli}
          onCancel={() => { setShowForm(false); setShowNuovoForm(false); setEditNtli(undefined); }}
        />
      )}
      {chiudiNtli && (
        <ChiudiModal
          ntli={chiudiNtli}
          onChiudi={handleChiudiNtli}
          onCancel={() => setChiudiNtli(null)}
        />
      )}
    </div>
  );
}
