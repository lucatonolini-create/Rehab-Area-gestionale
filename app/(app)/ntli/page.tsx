"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ShieldAlert, Plus, Pencil, Trash2, X, CheckCircle2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, FileDown,
} from "lucide-react";
import {
  loadAtleti, loadNtli, upsertNtli, deleteNtli,
  loadNtliDaily, upsertNtliDaily, deleteNtliDaily, uid,
  NTLI_STATI, TRAINING_MODIFICATIONS,
  type Atleta, type NtliRecord, type NtliDaily, type NtliStato, type TrainingModification,
} from "@/lib/store";
import OsiicsCombobox from "@/components/OsiicsCombobox";
import type { OsiicsCode } from "@/lib/store";

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND = "#C8102E";
const BLUE = "#2563EB";

const STATI_COLOR: Record<NtliStato, string> = {
  "Attivo": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "In miglioramento": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Stabile": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Peggiorato": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Risolto": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Chiuso": "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const LATI = ["Sinistro", "Destro", "Bilaterale", "Centrale", "N/A"];
const BODY_PARTS = [
  "Testa/Collo", "Spalla", "Braccio/Gomito", "Avambraccio/Polso/Mano",
  "Schiena/Colonna", "Addome/Fianchi", "Coscia", "Ginocchio",
  "Gamba/Caviglia", "Piede/Dita", "Altro",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(d?: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysBetween(a: string, b?: string | null): number {
  return Math.round((new Date(b ?? today()).getTime() - new Date(a).getTime()) / 86400000);
}

function vasColor(v?: number | null): string {
  if (v == null) return "text-gray-400";
  if (v <= 3) return "text-green-600";
  if (v <= 6) return "text-yellow-600";
  return "text-red-600";
}

function vasBarColor(v: number): string {
  if (v <= 3) return "#22c55e";
  if (v <= 6) return "#eab308";
  return BRAND;
}

// ── VAS inline slider ─────────────────────────────────────────────────────────

function VasSlider({
  value, onChange, label,
}: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className={`font-semibold ${vasColor(value)}`}>
          {value == null ? "—" : value}
        </span>
      </div>
      <input
        type="range" min={0} max={10} step={1}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-red-600 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>0</span><span>5</span><span>10</span>
      </div>
      {value != null && (
        <button
          onClick={() => onChange(null)}
          className="text-[10px] text-gray-400 hover:text-gray-600 underline text-left"
        >
          rimuovi
        </button>
      )}
    </div>
  );
}

// ── VAS line chart ────────────────────────────────────────────────────────────

function VasChart({ daily }: { daily: NtliDaily[] }) {
  const W = 600, H = 160;
  const PAD = { top: 18, right: 16, bottom: 36, left: 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const pts = daily
    .filter((d) => d.vasStart != null || d.vasEnd != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (pts.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-300 text-xs" style={{ height: 100 }}>
        nessun dato VAS
      </div>
    );
  }

  const n = pts.length;
  const toX = (i: number) => PAD.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const toY = (v: number) => PAD.top + (1 - v / 10) * cH;

  const startPts = pts.filter((p) => p.vasStart != null);
  const endPts = pts.filter((p) => p.vasEnd != null);

  const lineStr = (subset: NtliDaily[], key: "vasStart" | "vasEnd") =>
    subset
      .map((p) => {
        const idx = pts.indexOf(p);
        const v = p[key] as number;
        return `${toX(idx).toFixed(1)},${toY(v).toFixed(1)}`;
      })
      .join(" ");

  const yTicks = [0, 3, 5, 7, 10];
  const step = n <= 14 ? 1 : Math.ceil(n / 14);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }} preserveAspectRatio="none">
      {/* Y grid */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left} y1={toY(t)} x2={W - PAD.right} y2={toY(t)}
            stroke={t === 3 ? "#fbbf24" : t === 5 ? BRAND : "#e5e7eb"}
            strokeWidth={t === 3 || t === 5 ? "1" : "0.8"}
            strokeDasharray={t === 3 || t === 5 ? "4,3" : undefined}
            opacity={t === 3 || t === 5 ? 0.7 : 1}
          />
          <text x={PAD.left - 4} y={toY(t) + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{t}</text>
        </g>
      ))}

      {/* VAS Start line (blue) */}
      {startPts.length > 1 && (
        <polyline
          points={lineStr(startPts, "vasStart")}
          fill="none" stroke={BLUE} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      )}
      {startPts.map((p) => {
        const idx = pts.indexOf(p);
        return (
          <circle key={`s${idx}`} cx={toX(idx)} cy={toY(p.vasStart!)} r="4"
            fill={BLUE} stroke="white" strokeWidth="1.5" />
        );
      })}

      {/* VAS End line (red) */}
      {endPts.length > 1 && (
        <polyline
          points={lineStr(endPts, "vasEnd")}
          fill="none" stroke={BRAND} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="6,3"
        />
      )}
      {endPts.map((p) => {
        const idx = pts.indexOf(p);
        return (
          <circle key={`e${idx}`} cx={toX(idx)} cy={toY(p.vasEnd!)} r="4"
            fill={BRAND} stroke="white" strokeWidth="1.5" />
        );
      })}

      {/* X labels */}
      {pts.map((p, i) =>
        i % step === 0 ? (
          <text key={i} x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="8" fill="#6b7280">
            {fmt(p.date).slice(0, 5)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ── NTLI form ─────────────────────────────────────────────────────────────────

const EMPTY_NTLI = (): Omit<NtliRecord, "id" | "createdAt" | "updatedAt"> => ({
  athleteId: "",
  athleteName: "",
  onsetDate: today(),
  endDate: undefined,
  osiicsCode: undefined,
  osiicsDescription: undefined,
  painLocation: BODY_PARTS[0],
  bodySide: LATI[0],
  clinicalDiagnosis: undefined,
  status: "Attivo",
  notes: undefined,
});

function NtliForm({
  atleti,
  initial,
  onSave,
  onCancel,
}: {
  atleti: Atleta[];
  initial?: NtliRecord;
  onSave: (n: NtliRecord) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Omit<NtliRecord, "id" | "createdAt" | "updatedAt">>(
    initial
      ? {
          athleteId: initial.athleteId,
          athleteName: initial.athleteName,
          onsetDate: initial.onsetDate,
          endDate: initial.endDate,
          osiicsCode: initial.osiicsCode,
          osiicsDescription: initial.osiicsDescription,
          painLocation: initial.painLocation,
          bodySide: initial.bodySide,
          clinicalDiagnosis: initial.clinicalDiagnosis,
          status: initial.status,
          notes: initial.notes,
        }
      : EMPTY_NTLI()
  );
  const [osiics, setOsiics] = useState<OsiicsCode | null>(
    initial?.osiicsCode
      ? { id: "", codice: initial.osiicsCode, descrizioneIta: initial.osiicsDescription ?? "", descrizioneEng: "", regioneAnatomica: "", categoriaPatologia: "", versione: "" }
      : null
  );

  const set = (k: keyof typeof form, v: unknown) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleAthleteChange = (id: string) => {
    const a = atleti.find((x) => x.id === id);
    set("athleteId", id);
    set("athleteName", a ? a.nome : "");
  };

  const handleSave = () => {
    if (!form.athleteId || !form.painLocation || !form.onsetDate) return;
    const now = new Date().toISOString();
    onSave({
      ...form,
      osiicsCode: osiics?.codice,
      osiicsDescription: osiics?.descrizioneIta,
      id: initial?.id ?? uid(),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            {initial ? "Modifica NTLI" : "Nuovo NTLI"}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Atleta */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Atleta *</label>
          <select
            value={form.athleteId}
            onChange={(e) => handleAthleteChange(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="">— seleziona —</option>
            {atleti.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>

        {/* Onset / End */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data insorgenza *</label>
            <input type="date" value={form.onsetDate} onChange={(e) => set("onsetDate", e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data risoluzione</label>
            <input type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value || undefined)}
              className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
          </div>
        </div>

        {/* OSIICS */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Codice OSIICS</label>
          <OsiicsCombobox value={osiics} onChange={setOsiics} />
        </div>

        {/* Location + Side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sede del dolore *</label>
            <select value={form.painLocation} onChange={(e) => set("painLocation", e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
              {BODY_PARTS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lato *</label>
            <select value={form.bodySide} onChange={(e) => set("bodySide", e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
              {LATI.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* Diagnosis */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Diagnosi clinica</label>
          <input type="text" value={form.clinicalDiagnosis ?? ""} onChange={(e) => set("clinicalDiagnosis", e.target.value || undefined)}
            placeholder="es. tendinopatia rotulea"
            className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stato</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value as NtliStato)}
            className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
            {NTLI_STATI.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</label>
          <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} rows={2}
            className="border rounded-lg px-3 py-2 text-sm resize-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={!form.athleteId || !form.onsetDate || !form.painLocation}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: BRAND }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Daily entry row ───────────────────────────────────────────────────────────

function DailyRow({
  ntli,
  date,
  existing,
  onSave,
}: {
  ntli: NtliRecord;
  date: string;
  existing?: NtliDaily;
  onSave: (d: NtliDaily) => void;
}) {
  const [vasStart, setVasStart] = useState<number | null>(existing?.vasStart ?? null);
  const [vasEnd, setVasEnd] = useState<number | null>(existing?.vasEnd ?? null);
  const [mod, setMod] = useState<TrainingModification>(existing?.trainingModification ?? "Nessuna modifica");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const now = new Date().toISOString();
    onSave({
      id: existing?.id ?? uid(),
      ntliId: ntli.id,
      athleteId: ntli.athleteId,
      date,
      vasStart,
      vasEnd,
      trainingModification: mod,
      note: note || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
      <td className="py-3 px-3 text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {ntli.athleteName}
        <div className="text-xs text-gray-400">{ntli.painLocation} — {ntli.bodySide}</div>
      </td>
      <td className="py-3 px-3">
        <VasSlider value={vasStart} onChange={setVasStart} label="Inizio" />
      </td>
      <td className="py-3 px-3">
        <VasSlider value={vasEnd} onChange={setVasEnd} label="Fine" />
      </td>
      <td className="py-3 px-3">
        <select
          value={mod}
          onChange={(e) => setMod(e.target.value as TrainingModification)}
          className="border rounded px-2 py-1 text-xs dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 w-full"
        >
          {TRAINING_MODIFICATIONS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </td>
      <td className="py-3 px-3">
        <input
          type="text" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="note opzionali"
          className="border rounded px-2 py-1 text-xs w-full dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
        />
      </td>
      <td className="py-3 px-3 text-right">
        <button
          onClick={handleSave}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${saved ? "bg-green-500" : ""}`}
          style={saved ? undefined : { background: BRAND }}
        >
          {saved ? <CheckCircle2 size={14} /> : "Salva"}
        </button>
      </td>
    </tr>
  );
}

// ── Weekly summary card ───────────────────────────────────────────────────────

function WeeklySummaryCard({ ntli, daily }: { ntli: NtliRecord; daily: NtliDaily[] }) {
  const [open, setOpen] = useState(false);

  const days = daysBetween(ntli.onsetDate, ntli.endDate);
  const sessions = daily.length;
  const avgStart = sessions
    ? daily.reduce((s, d) => s + (d.vasStart ?? 0), 0) / daily.filter((d) => d.vasStart != null).length || null
    : null;
  const avgEnd = sessions
    ? daily.reduce((s, d) => s + (d.vasEnd ?? 0), 0) / daily.filter((d) => d.vasEnd != null).length || null
    : null;

  const lastVas = [...daily].sort((a, b) => b.date.localeCompare(a.date))[0];
  const trend = lastVas && lastVas.vasStart != null && lastVas.vasEnd != null
    ? lastVas.vasEnd - lastVas.vasStart
    : null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">
              {ntli.athleteName}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATI_COLOR[ntli.status]}`}>
              {ntli.status}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {ntli.painLocation} — {ntli.bodySide} · {days} giorni · {sessions} sedute
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {avgStart != null && (
            <div className="text-center">
              <div className={`font-bold ${vasColor(avgStart)}`}>{avgStart.toFixed(1)}</div>
              <div className="text-xs text-gray-400">VAS med. inizio</div>
            </div>
          )}
          {avgEnd != null && (
            <div className="text-center">
              <div className={`font-bold ${vasColor(avgEnd)}`}>{avgEnd.toFixed(1)}</div>
              <div className="text-xs text-gray-400">VAS med. fine</div>
            </div>
          )}
          {trend != null && (
            <div className="flex items-center gap-1">
              {trend < -0.5 ? (
                <TrendingDown size={16} className="text-green-500" />
              ) : trend > 0.5 ? (
                <TrendingUp size={16} className="text-red-500" />
              ) : (
                <Minus size={16} className="text-gray-400" />
              )}
            </div>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex gap-6 mt-3 mb-2 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 rounded" style={{ background: BLUE }}></div>VAS inizio
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 rounded border-dashed border-b-2" style={{ borderColor: BRAND }}></div>VAS fine
            </div>
            <div className="flex items-center gap-1.5 text-yellow-600">── VAS 3 (soglia attenzione)</div>
            <div className="flex items-center gap-1.5" style={{ color: BRAND }}>── VAS 5 (soglia critica)</div>
          </div>
          <VasChart daily={daily} />

          {daily.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left py-1.5 pr-4">Data</th>
                    <th className="text-left py-1.5 pr-4">VAS inizio</th>
                    <th className="text-left py-1.5 pr-4">VAS fine</th>
                    <th className="text-left py-1.5 pr-4">Modifica</th>
                    <th className="text-left py-1.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {[...daily].sort((a, b) => b.date.localeCompare(a.date)).map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 dark:border-gray-800/50">
                      <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">{fmt(d.date)}</td>
                      <td className={`py-1.5 pr-4 font-semibold ${vasColor(d.vasStart)}`}>{d.vasStart ?? "—"}</td>
                      <td className={`py-1.5 pr-4 font-semibold ${vasColor(d.vasEnd)}`}>{d.vasEnd ?? "—"}</td>
                      <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">{d.trainingModification}</td>
                      <td className="py-1.5 text-gray-500 dark:text-gray-500">{d.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "monitoraggio" | "riepilogo" | "gestione";

export default function NtliPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [records, setRecords] = useState<NtliRecord[]>([]);
  const [daily, setDaily] = useState<NtliDaily[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<NtliRecord | undefined>(undefined);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [monDate, setMonDate] = useState(today());

  useEffect(() => {
    (async () => {
      const [a, r, d] = await Promise.all([loadAtleti(), loadNtli(), loadNtliDaily()]);
      setAtleti(a);
      setRecords(r);
      setDaily(d);
      setLoading(false);
    })();
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────

  const activeRecords = useMemo(
    () => records.filter((r) => r.status !== "Chiuso" && r.status !== "Risolto"),
    [records]
  );

  const dailyByNtli = useMemo(() => {
    const map = new Map<string, NtliDaily[]>();
    for (const d of daily) {
      const arr = map.get(d.ntliId) ?? [];
      arr.push(d);
      map.set(d.ntliId, arr);
    }
    return map;
  }, [daily]);

  const monitoringRecords = useMemo(
    () => activeRecords.sort((a, b) => a.athleteName.localeCompare(b.athleteName)),
    [activeRecords]
  );

  const monDailyByNtli = useMemo(() => {
    const map = new Map<string, NtliDaily>();
    for (const d of daily) {
      if (d.date === monDate) map.set(d.ntliId, d);
    }
    return map;
  }, [daily, monDate]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleSaveNtli = async (n: NtliRecord) => {
    await upsertNtli(n);
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === n.id);
      return idx >= 0 ? prev.map((r, i) => (i === idx ? n : r)) : [...prev, n];
    });
    setShowForm(false);
    setEditRecord(undefined);
  };

  const handleDeleteNtli = async (id: string) => {
    await deleteNtli(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDeleteConfirm(null);
  };

  const handleSaveDaily = async (d: NtliDaily) => {
    await upsertNtliDaily(d);
    setDaily((prev) => {
      const idx = prev.findIndex((x) => x.id === d.id);
      return idx >= 0 ? prev.map((x, i) => (i === idx ? d : x)) : [...prev, d];
    });
  };

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const active = records.filter((r) => r.status === "Attivo").length;
    const improving = records.filter((r) => r.status === "In miglioramento").length;
    const worsened = records.filter((r) => r.status === "Peggiorato").length;
    const resolved = records.filter((r) => r.status === "Risolto" || r.status === "Chiuso").length;

    const avgDays =
      records.length > 0
        ? Math.round(records.reduce((s, r) => s + daysBetween(r.onsetDate, r.endDate), 0) / records.length)
        : 0;

    const allVasStart = daily.filter((d) => d.vasStart != null).map((d) => d.vasStart as number);
    const avgVas =
      allVasStart.length > 0
        ? (allVasStart.reduce((s, v) => s + v, 0) / allVasStart.length).toFixed(1)
        : "—";

    return { active, improving, worsened, resolved, avgDays, avgVas };
  }, [records, daily]);

  // ── Tabs ─────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "monitoraggio", label: "Monitoraggio giornaliero" },
    { id: "riepilogo", label: "Riepilogo settimanale" },
    { id: "gestione", label: "Gestione NTLI" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <ShieldAlert size={24} style={{ color: BRAND }} />
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            NTLI — Non-Time-Loss Injuries
          </h1>
          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
            {activeRecords.length} attivi
          </span>
        </div>
        <nav className="flex gap-1 mt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                tab === t.id
                  ? "text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
              style={tab === t.id ? { background: BRAND } : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto">
        {loading ? (
          <div className="text-gray-400 text-sm py-12 text-center">Caricamento...</div>
        ) : (
          <>
            {/* ── Dashboard ──────────────────────────────────────────────── */}
            {tab === "dashboard" && (
              <div className="flex flex-col gap-6">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: "Attivi", value: kpis.active, color: "text-red-600" },
                    { label: "In miglioramento", value: kpis.improving, color: "text-yellow-600" },
                    { label: "Peggiorati", value: kpis.worsened, color: "text-orange-600" },
                    { label: "Risolti/Chiusi", value: kpis.resolved, color: "text-green-600" },
                    { label: "Durata media (gg)", value: kpis.avgDays, color: "text-gray-700 dark:text-gray-300" },
                    { label: "VAS medio inizio", value: kpis.avgVas, color: "text-blue-600" },
                  ].map((k) => (
                    <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col gap-1">
                      <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                      <div className="text-xs text-gray-400">{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Active list */}
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    NTLI attivi
                  </h2>
                  {activeRecords.length === 0 ? (
                    <div className="text-gray-400 text-sm py-8 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                      Nessun NTLI attivo
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {activeRecords.map((r) => {
                        const ntliDaily = dailyByNtli.get(r.id) ?? [];
                        const last = [...ntliDaily].sort((a, b) => b.date.localeCompare(a.date))[0];
                        const days = daysBetween(r.onsetDate);
                        return (
                          <div key={r.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{r.athleteName}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATI_COLOR[r.status]}`}>{r.status}</span>
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {r.painLocation} — {r.bodySide}
                                {r.clinicalDiagnosis && ` · ${r.clinicalDiagnosis}`}
                                {r.osiicsCode && ` · OSIICS ${r.osiicsCode}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-6 shrink-0">
                              <div className="text-center">
                                <div className="font-semibold text-sm text-gray-700 dark:text-gray-300">{days}</div>
                                <div className="text-xs text-gray-400">giorni</div>
                              </div>
                              {last?.vasStart != null && (
                                <div className="text-center">
                                  <div className={`font-bold text-sm ${vasColor(last.vasStart)}`}>{last.vasStart}</div>
                                  <div className="text-xs text-gray-400">VAS ult.</div>
                                </div>
                              )}
                              <div className="flex flex-col items-center gap-0.5">
                                {/* Mini bar chart last VAS */}
                                {last?.vasStart != null && (
                                  <svg viewBox="0 0 40 24" className="w-10" style={{ height: 24 }}>
                                    <rect x="4" y={24 - (last.vasStart / 10) * 20} width="14" height={(last.vasStart / 10) * 20}
                                      fill={vasBarColor(last.vasStart)} rx="2" />
                                    {last.vasEnd != null && (
                                      <rect x="22" y={24 - (last.vasEnd / 10) * 20} width="14" height={(last.vasEnd / 10) * 20}
                                        fill={vasBarColor(last.vasEnd)} rx="2" opacity="0.7" />
                                    )}
                                  </svg>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* All records table */}
                {records.filter((r) => r.status === "Risolto" || r.status === "Chiuso").length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Risolti / Chiusi</h2>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            {["Atleta", "Sede", "Insorgenza", "Risoluzione", "Durata", "Stato"].map((h) => (
                              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {records
                            .filter((r) => r.status === "Risolto" || r.status === "Chiuso")
                            .map((r) => (
                              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                                <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{r.athleteName}</td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{r.painLocation} — {r.bodySide}</td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{fmt(r.onsetDate)}</td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{fmt(r.endDate)}</td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{daysBetween(r.onsetDate, r.endDate)} gg</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATI_COLOR[r.status]}`}>{r.status}</span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Monitoraggio giornaliero ────────────────────────────────── */}
            {tab === "monitoraggio" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Data seduta</label>
                  <input
                    type="date"
                    value={monDate}
                    onChange={(e) => setMonDate(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                  />
                </div>

                {monitoringRecords.length === 0 ? (
                  <div className="text-gray-400 text-sm py-12 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    Nessun NTLI attivo da monitorare.<br />
                    <button onClick={() => setTab("gestione")} className="mt-2 text-sm underline" style={{ color: BRAND }}>
                      Aggiungi NTLI
                    </button>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {["Atleta / Sede", "VAS inizio seduta", "VAS fine seduta", "Modifica allenamento", "Note", ""].map((h) => (
                            <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monitoringRecords.map((r) => (
                          <DailyRow
                            key={r.id}
                            ntli={r}
                            date={monDate}
                            existing={monDailyByNtli.get(r.id)}
                            onSave={handleSaveDaily}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Riepilogo settimanale ───────────────────────────────────── */}
            {tab === "riepilogo" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-6 h-0.5 rounded" style={{ background: BLUE }}></div>
                    VAS inizio
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-6 h-0.5 rounded" style={{ borderBottom: `2px dashed ${BRAND}` }}></div>
                    VAS fine
                  </div>
                  <div className="text-xs text-yellow-600">— soglia 3</div>
                  <div className="text-xs" style={{ color: BRAND }}>— soglia 5</div>
                </div>

                {records.length === 0 ? (
                  <div className="text-gray-400 text-sm py-12 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    Nessun NTLI registrato
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {records
                      .sort((a, b) => a.athleteName.localeCompare(b.athleteName))
                      .map((r) => (
                        <WeeklySummaryCard
                          key={r.id}
                          ntli={r}
                          daily={dailyByNtli.get(r.id) ?? []}
                        />
                      ))}
                  </div>
                )}

                {/* Squad aggregate */}
                {daily.length > 0 && (
                  <div className="mt-2">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Andamento squadra — media VAS inizio
                    </h2>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <SquadVasChart daily={daily} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Gestione NTLI ───────────────────────────────────────────── */}
            {tab === "gestione" && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <button
                    onClick={() => { setEditRecord(undefined); setShowForm(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ background: BRAND }}
                  >
                    <Plus size={16} />
                    Nuovo NTLI
                  </button>
                </div>

                {records.length === 0 ? (
                  <div className="text-gray-400 text-sm py-12 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    Nessun NTLI registrato
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {["Atleta", "OSIICS", "Sede / Lato", "Diagnosi", "Insorgenza", "Stato", ""].map((h) => (
                            <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                            <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{r.athleteName}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                              {r.osiicsCode ? (
                                <span title={r.osiicsDescription}>{r.osiicsCode}</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.painLocation} — {r.bodySide}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{r.clinicalDiagnosis ?? "—"}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.onsetDate)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATI_COLOR[r.status]}`}>{r.status}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => { setEditRecord(r); setShowForm(true); }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(r.id)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <NtliForm
          atleti={atleti}
          initial={editRecord}
          onSave={handleSaveNtli}
          onCancel={() => { setShowForm(false); setEditRecord(undefined); }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle size={20} />
              <span className="font-semibold">Elimina NTLI</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Eliminando questo NTLI verranno cancellati anche tutti i dati di monitoraggio giornaliero associati. Continuare?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                Annulla
              </button>
              <button onClick={() => handleDeleteNtli(deleteConfirm)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700">
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          nav, button { display: none !important; }
          body { background: white !important; }
          .bg-gray-50 { background: white !important; }
        }
      `}</style>
    </div>
  );
}

// ── Squad aggregate VAS chart ─────────────────────────────────────────────────

function SquadVasChart({ daily }: { daily: NtliDaily[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const d of daily) {
      if (d.vasStart == null) continue;
      const arr = map.get(d.date) ?? [];
      arr.push(d.vasStart);
      map.set(d.date, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => ({
        date,
        avg: vals.reduce((s: number, v: number) => s + v, 0) / vals.length,
      }));
  }, [daily]);

  if (byDate.length === 0) return <div className="text-gray-300 text-xs text-center py-6">nessun dato</div>;

  const W = 600, H = 140;
  const PAD = { top: 14, right: 16, bottom: 30, left: 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = byDate.length;

  const toX = (i: number) => PAD.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const toY = (v: number) => PAD.top + (1 - v / 10) * cH;

  const linePts = byDate.map((p, i) => `${toX(i).toFixed(1)},${toY(p.avg).toFixed(1)}`).join(" ");
  const step = n <= 14 ? 1 : Math.ceil(n / 14);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }} preserveAspectRatio="none">
      {[0, 3, 5, 10].map((t) => (
        <g key={t}>
          <line x1={PAD.left} y1={toY(t)} x2={W - PAD.right} y2={toY(t)}
            stroke={t === 3 ? "#fbbf24" : t === 5 ? BRAND : "#e5e7eb"}
            strokeWidth={t === 3 || t === 5 ? "1" : "0.8"}
            strokeDasharray={t === 3 || t === 5 ? "4,3" : undefined}
            opacity={t === 3 || t === 5 ? 0.7 : 1} />
          <text x={PAD.left - 4} y={toY(t) + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{t}</text>
        </g>
      ))}
      <polyline points={linePts} fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {byDate.map((p, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(p.avg)} r="4" fill={BLUE} stroke="white" strokeWidth="1.5" />
          {i % step === 0 && (
            <text x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="8" fill="#6b7280">
              {fmt(p.date).slice(0, 5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
