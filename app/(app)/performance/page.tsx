"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Activity, Table2, BarChart3, FileDown, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  loadAtleti, loadProgrammi, nd,
  subscribeToAtleti, subscribeToProgrammi,
  type Atleta, type Programma, type TestFisiometrico,
} from "@/lib/store";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pn(s?: string): number | null {
  if (!s?.trim()) return null;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

function fv(v: number | null, dec = 0): string {
  if (v === null) return "—";
  return dec > 0 ? v.toFixed(dec) : String(Math.round(v));
}

// ── Test value extractor ──────────────────────────────────────────────────────

function extractTestValues(t: TestFisiometrico) {
  const n = (s?: unknown): number | undefined => {
    if (!s || typeof s !== "string" || !s.trim()) return undefined;
    const v = parseFloat(s.replace(",", "."));
    return isNaN(v) ? undefined : v;
  };
  const nome = t.nome ?? "";
  if (["CMJ – Counter Movement Jump", "CMJ braccia libere", "Squat Jump", "Broad Jump"].includes(nome))
    return { single: n(t.altezzaSalto), unit: "cm", isBilateral: false };
  if (nome === "Drop Jump") {
    const r = n(t.rsi), a = n(t.altezzaSalto);
    return { single: r ?? a, altezza: r != null ? a : undefined, sx: undefined, dx: undefined, unit: r != null ? "" : "cm", isBilateral: false };
  }
  if (nome === "SL Drop Jump")
    return { sx: n(t.rsiSx), dx: n(t.rsiDx), unit: "", isBilateral: true };
  if (nome === "SL CMJ")
    return { sx: n(t.risultatoSx), dx: n(t.risultatoDx), unit: "cm", isBilateral: true };
  if (nome === "Squeeze")
    return { single: n(t.risultato), unit: "N", isBilateral: false };
  if (nome === "Lunge test" || nome === "Dorsiflexion Lunge Test")
    return { sx: n(t.risultatoSx), dx: n(t.risultatoDx), unit: "cm", isBilateral: true };
  if (nome === "QSLS")
    return { sx: n(t.risultatoSx), dx: n(t.risultatoDx), unit: "", isBilateral: true };
  if (nome === "Gacon" || nome === "IFT 30-15")
    return { single: n(t.livello), unit: "", isBilateral: false };
  if (nome.startsWith("Sprint") || nome === "10x100m")
    return { single: n(t.tempo), unit: "s", isBilateral: false };
  if (nome === "Jurdan")
    return { sx: n(t.ginocchioSx), dx: n(t.ginocchioDx), unit: "°", isBilateral: true };
  const sv = n(t.risultato);
  if (sv != null) return { single: sv, unit: t.unita || "", isBilateral: false };
  const sx = n(t.risultatoSx), dx = n(t.risultatoDx);
  if (sx != null || dx != null) return { sx, dx, unit: t.unita || "", isBilateral: true };
  return { unit: "", isBilateral: false } as { single?: number; sx?: number; dx?: number; unit: string; isBilateral: boolean };
}

const TEST_COLORS: Record<string, string> = {
  "CMJ – Counter Movement Jump": "#7c3aed",
  "CMJ braccia libere": "#8b5cf6",
  "Squat Jump": "#6d28d9",
  "Broad Jump": "#4f46e5",
  "Drop Jump": "#2563eb",
  "SL Drop Jump": "#0891b2",
  "SL CMJ": "#0e7490",
  "Squeeze": "#d97706",
  "Lunge test": "#16a34a",
  "Dorsiflexion Lunge Test": "#15803d",
  "QSLS": "#dc2626",
  "Gacon": "#ea580c",
  "IFT 30-15": "#f59e0b",
  "Sprint 10m": "#10b981",
  "Sprint 20m": "#059669",
  "Sprint 30m": "#047857",
  "10x100m": "#65a30d",
  "Jurdan": "#db2777",
};

function formatTestResult(t: TestFisiometrico): string {
  return [
    t.risultato,
    t.altezzaSalto ? `${t.altezzaSalto} cm` : "",
    t.risultatoSx ? `Sx ${t.risultatoSx}` : "",
    t.risultatoDx ? `Dx ${t.risultatoDx}` : "",
    t.altezzaSaltoSx ? `Sx ↕${t.altezzaSaltoSx}cm` : "",
    t.altezzaSaltoDx ? `Dx ↕${t.altezzaSaltoDx}cm` : "",
    t.tempoContatto ? `Contatto: ${t.tempoContatto}s` : "",
    t.rsi ? `RSI: ${t.rsi}` : "",
    t.tempoContattoSx ? `Sx Cont.: ${t.tempoContattoSx}s` : "",
    t.tempoContattoDx ? `Dx Cont.: ${t.tempoContattoDx}s` : "",
    t.rsiSx ? `RSI Sx: ${t.rsiSx}` : "",
    t.rsiDx ? `RSI Dx: ${t.rsiDx}` : "",
    t.tempo ? `Tempo: ${t.tempo}s` : "",
    t.livello ? `Liv: ${t.livello}` : "",
    t.vo2max ? `Vo2Max: ${t.vo2max}` : "",
    t.vam ? `VAM: ${t.vam}` : "",
    t.ginocchioDx ? `Gin.Dx: ${t.ginocchioDx}°` : "",
    t.ancaSx ? `Anca Sx: ${t.ancaSx}°` : "",
    t.diffGinocchioDxAncaSx ? `Δ: ${t.diffGinocchioDxAncaSx}°` : "",
    t.ginocchioSx ? `Gin.Sx: ${t.ginocchioSx}°` : "",
    t.ancaDx ? `Anca Dx: ${t.ancaDx}°` : "",
    t.diffGinocchioSxAncaDx ? `Δ: ${t.diffGinocchioSxAncaDx}°` : "",
  ].filter(Boolean).join(" / ") || "—";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestTableRow {
  data: string;
  dateLabel: string;
  infortunio: string;
  nomeTest: string;
  risultato: string;
}

interface TestPoint {
  data: string;
  dateLabel: string;
  single?: number;
  sx?: number;
  dx?: number;
  altezza?: number; // Drop Jump: altezza salto (single = RSI)
}

interface TestTimeline {
  points: TestPoint[];
  unit: string;
  isBilateral: boolean;
  color: string;
}

interface Session {
  data: string;
  dateLabel: string;
  nome: string;
  fase: string;
  infortunio: string;
  rpe: number | null;
  interno: number | null;
  durata: number | null;
  distanza: number | null;
  hsr: number | null;
  velMax: number | null;
  vel21: number | null;
  vel25: number | null;
  acc: number | null;
  dec: number | null;
  sprint: number | null;
  potenza: number | null;
}

function toSession(p: Programma): Session | null {
  const c = p.carico;
  if (!c) return null;
  const s: Session = {
    data: p.data ?? "",
    dateLabel: p.data
      ? new Date(p.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
      : "",
    nome: p.nome ?? "",
    fase: p.fase ?? "",
    infortunio: p.infortunioLabel ?? "",
    rpe: pn(c.rpe),
    interno: pn(c.interno),
    durata: pn(c.durata),
    distanza: pn(c.distanzaTotale),
    hsr: pn(c.hsr),
    velMax: pn(c.velocitaMax),
    vel21: pn(c.velocita21),
    vel25: pn(c.velocita25),
    acc: pn(c.accelerazioni),
    dec: pn(c.decelerazioni),
    sprint: pn(c.sprint),
    potenza: pn(c.potenzaMetabolica),
  };
  const hasData =
    s.rpe != null || s.distanza != null || s.hsr != null ||
    s.velMax != null || s.acc != null || s.interno != null;
  return hasData ? s : null;
}

// ── Metric definitions ────────────────────────────────────────────────────────

interface MetricDef {
  key: keyof Session;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  dec: number;
}

const METRICS: MetricDef[] = [
  { key: "rpe",      label: "RPE",                 shortLabel: "RPE",       unit: "",        color: "#C8102E", dec: 1 },
  { key: "durata",   label: "Durata",              shortLabel: "Durata",    unit: "min",     color: "#6b7280", dec: 0 },
  { key: "interno",  label: "Carico Interno",       shortLabel: "TL",        unit: "UA",      color: "#7c3aed", dec: 0 },
  { key: "distanza", label: "Distanza Totale",      shortLabel: "Dist. Tot.", unit: "m",       color: "#2563eb", dec: 0 },
  { key: "hsr",      label: "D>16 km/h",           shortLabel: "D>16 km/h", unit: "m",       color: "#0891b2", dec: 0 },
  { key: "vel21",    label: "D>20 km/h",           shortLabel: "D>20 km/h", unit: "m",       color: "#16a34a", dec: 0 },
  { key: "vel25",    label: "D>25 km/h",           shortLabel: "D>25 km/h", unit: "m",       color: "#15803d", dec: 0 },
  { key: "velMax",   label: "Velocità Max",         shortLabel: "Vel. Max",  unit: "km/h",    color: "#059669", dec: 1 },
  { key: "acc",      label: "Accelerazioni",        shortLabel: "N. Acc.",   unit: "",        color: "#d97706", dec: 0 },
  { key: "dec",      label: "Decelerazioni",        shortLabel: "N. Dec.",   unit: "",        color: "#ea580c", dec: 0 },
  { key: "sprint",   label: "Sprint",               shortLabel: "N. Sprint", unit: "",        color: "#db2777", dec: 0 },
  { key: "potenza",  label: "Potenza Metabolica",   shortLabel: "Potenza",   unit: "W/kg",    color: "#65a30d", dec: 1 },
];

// ── SVG Chart ────────────────────────────────────────────────────────────────

function MetricChart({ sessions, metric }: { sessions: Session[]; metric: MetricDef }) {
  const pts = sessions
    .map((s, i) => ({ i, label: s.dateLabel, v: s[metric.key] as number | null }))
    .filter((p) => p.v !== null) as { i: number; label: string; v: number }[];

  if (pts.length < 2) {
    return (
      <div className="flex items-center justify-center text-gray-300 text-xs" style={{ height: 160 }}>
        Dati insufficienti
      </div>
    );
  }

  const W = 600, H = 180;
  const PAD = { top: 16, right: 16, bottom: 34, left: 46 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const vals = pts.map((p) => p.v);
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const span = (rawMax - rawMin) * 0.12 || rawMax * 0.1 || 1;
  const minV = rawMin - span;
  const maxV = rawMax + span;
  const rangeV = maxV - minV;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const n = pts.length;

  const toX = (idx: number) => PAD.left + (idx / Math.max(n - 1, 1)) * cW;
  const toY = (v: number) => PAD.top + (1 - (v - minV) / rangeV) * cH;

  const linePts = pts.map((p) => `${toX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");
  const areaPts =
    `${toX(pts[0].i).toFixed(1)},${(PAD.top + cH).toFixed(1)} ` +
    linePts +
    ` ${toX(pts[n - 1].i).toFixed(1)},${(PAD.top + cH).toFixed(1)}`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: PAD.top + t * cH,
    label: (maxV - t * rangeV).toFixed(metric.dec),
  }));

  const step = n <= 10 ? 1 : n <= 20 ? 2 : Math.ceil(n / 10);
  const gradId = `grad-${metric.key}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={metric.color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={metric.color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Y grid + labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#e5e7eb" strokeWidth="0.8" />
          <text x={PAD.left - 4} y={t.y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{t.label}</text>
        </g>
      ))}

      {/* Average dashed */}
      <line
        x1={PAD.left} y1={toY(avg)} x2={W - PAD.right} y2={toY(avg)}
        stroke={metric.color} strokeWidth="0.9" strokeDasharray="5,4" opacity="0.4"
      />

      {/* Area */}
      <polygon points={areaPts} fill={`url(#${gradId})`} />

      {/* Line */}
      <polyline
        points={linePts} fill="none"
        stroke={metric.color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Dots + x labels */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={toX(p.i)} cy={toY(p.v)} r="4"
            fill={metric.color} stroke="white" strokeWidth="1.5"
          />
          {i % step === 0 && (
            <text x={toX(p.i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="8.5" fill="#6b7280">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Test chart ───────────────────────────────────────────────────────────────

function TestLineChart({ points, color, isBilateral, unit: _unit }: { points: TestPoint[]; color: string; isBilateral: boolean; unit: string }) {
  const W = 600, H = 180;
  const PAD = { top: 16, right: 16, bottom: 34, left: 46 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const noData = (
    <div className="flex items-center justify-center text-gray-300 text-xs" style={{ height: 160 }}>
      Dati insufficienti
    </div>
  );

  if (!isBilateral) {
    const pts = points.filter((p) => p.single != null) as (TestPoint & { single: number })[];
    if (pts.length < 2) return noData;
    const vals = pts.map((p) => p.single);
    const rawMin = Math.min(...vals), rawMax = Math.max(...vals);
    const span = (rawMax - rawMin) * 0.12 || rawMax * 0.1 || 1;
    const minV = rawMin - span, maxV = rawMax + span, rangeV = maxV - minV;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const n = pts.length;
    const toX = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * cW;
    const toY = (v: number) => PAD.top + (1 - (v - minV) / rangeV) * cH;
    const linePts = pts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.single).toFixed(1)}`).join(" ");
    const areaPts = `${toX(0).toFixed(1)},${(PAD.top + cH).toFixed(1)} ${linePts} ${toX(n - 1).toFixed(1)},${(PAD.top + cH).toFixed(1)}`;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: PAD.top + t * cH, label: (maxV - t * rangeV).toFixed(1) }));
    const step = n <= 10 ? 1 : n <= 20 ? 2 : Math.ceil(n / 10);
    const gid = `tg-${color.replace("#", "")}`;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#e5e7eb" strokeWidth="0.8" />
            <text x={PAD.left - 4} y={t.y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{t.label}</text>
          </g>
        ))}
        <line x1={PAD.left} y1={toY(avg)} x2={W - PAD.right} y2={toY(avg)} stroke={color} strokeWidth="0.9" strokeDasharray="5,4" opacity="0.4" />
        <polygon points={areaPts} fill={`url(#${gid})`} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(p.single)} r="4" fill={color} stroke="white" strokeWidth="1.5" />
            {i % step === 0 && <text x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="8.5" fill="#6b7280">{p.dateLabel}</text>}
          </g>
        ))}
      </svg>
    );
  }

  // Bilateral
  const SX_COL = "#2563eb", DX_COL = "#dc2626";
  const allVals: number[] = [];
  points.forEach((p) => { if (p.sx != null) allVals.push(p.sx); if (p.dx != null) allVals.push(p.dx); });
  if (allVals.length < 2) return noData;
  const rawMin = Math.min(...allVals), rawMax = Math.max(...allVals);
  const span = (rawMax - rawMin) * 0.12 || rawMax * 0.1 || 1;
  const minV = rawMin - span, maxV = rawMax + span, rangeV = maxV - minV;
  const n = points.length;
  const toX = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * cW;
  const toY = (v: number) => PAD.top + (1 - (v - minV) / rangeV) * cH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: PAD.top + t * cH, label: (maxV - t * rangeV).toFixed(1) }));
  const step = n <= 10 ? 1 : n <= 20 ? 2 : Math.ceil(n / 10);

  const buildSegs = (getter: (p: TestPoint) => number | undefined) => {
    const segs: string[][] = [];
    let cur: string[] = [];
    points.forEach((p, i) => {
      const v = getter(p);
      if (v != null) { cur.push(`${toX(i).toFixed(1)},${toY(v).toFixed(1)}`); }
      else if (cur.length) { segs.push(cur); cur = []; }
    });
    if (cur.length) segs.push(cur);
    return segs;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }} preserveAspectRatio="none">
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#e5e7eb" strokeWidth="0.8" />
          <text x={PAD.left - 4} y={t.y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{t.label}</text>
        </g>
      ))}
      {buildSegs((p) => p.sx).map((seg, i) => <polyline key={`sx${i}`} points={seg.join(" ")} fill="none" stroke={SX_COL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
      {buildSegs((p) => p.dx).map((seg, i) => <polyline key={`dx${i}`} points={seg.join(" ")} fill="none" stroke={DX_COL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6,3" />)}
      {points.map((p, i) => (
        <g key={i}>
          {p.sx != null && <circle cx={toX(i)} cy={toY(p.sx)} r="4" fill={SX_COL} stroke="white" strokeWidth="1.5" />}
          {p.dx != null && <circle cx={toX(i)} cy={toY(p.dx)} r="4" fill={DX_COL} stroke="white" strokeWidth="1.5" />}
          {i % step === 0 && <text x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="8.5" fill="#6b7280">{p.dateLabel}</text>}
        </g>
      ))}
      <circle cx={PAD.left + 4} cy={H - 5} r="3" fill={SX_COL} />
      <text x={PAD.left + 10} y={H - 2} fontSize="8" fill="#6b7280">Sx</text>
      <circle cx={PAD.left + 28} cy={H - 5} r="3" fill={DX_COL} />
      <text x={PAD.left + 34} y={H - 2} fontSize="8" fill="#6b7280">Dx</text>
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const RED = "#C8102E";
const RED_RGB: [number, number, number] = [200, 16, 46];
const DARK_RGB: [number, number, number] = [43, 43, 43];
const GRAY_RGB: [number, number, number] = [100, 100, 100];

export default function PerformancePage() {
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [programmi, setProgrammi] = useState<Programma[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"grafici" | "tabella">("grafici");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadAtleti(), loadProgrammi()]).then(([a, p]) => {
      setAtleti(a);
      setProgrammi(p);
      setLoading(false);
    });
    const ua = subscribeToAtleti(() => loadAtleti().then(setAtleti));
    const up = subscribeToProgrammi(() => loadProgrammi().then(setProgrammi));
    return () => { ua(); up(); };
  }, []);

  // Athletes who have ≥1 session with GPS/RPE data OR test data
  const atletiConDati = useMemo(() => {
    const ids = new Set(
      programmi.filter((p) => toSession(p) !== null || (p.tests?.length ?? 0) > 0).map((p) => p.atletaId)
    );
    return atleti
      .filter((a) => ids.has(a.id))
      .sort((a, b) => nd(a).localeCompare(nd(b)));
  }, [atleti, programmi]);

  useEffect(() => {
    if (!selectedId && atletiConDati.length > 0) setSelectedId(atletiConDati[0].id);
  }, [atletiConDati, selectedId]);

  const sessions = useMemo((): Session[] => {
    if (!selectedId) return [];
    return programmi
      .filter((p) => p.atletaId === selectedId)
      .map(toSession)
      .filter((s): s is Session => s !== null)
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [programmi, selectedId]);

  const selectedAtleta = atleti.find((a) => a.id === selectedId) ?? null;
  const idx = atletiConDati.findIndex((a) => a.id === selectedId);

  // Metrics that have ≥1 non-null value for this athlete
  const activeMetrics = METRICS.filter((m) => sessions.some((s) => s[m.key] != null));

  // ── Stat helpers ────────────────────────────────────────────────────────────
  function lastVal(key: keyof Session, dec: number): string {
    const vals = sessions.map((s) => s[key] as number | null).filter((v) => v != null) as number[];
    return vals.length ? fv(vals[vals.length - 1], dec) : "—";
  }

  function trend(key: keyof Session): "up" | "down" | "flat" | "none" {
    const vals = sessions.map((s) => s[key] as number | null).filter((v) => v != null) as number[];
    if (vals.length < 2) return "none";
    const diff = ((vals[vals.length - 1] - vals[vals.length - 2]) / (Math.abs(vals[vals.length - 2]) || 1)) * 100;
    if (Math.abs(diff) < 3) return "flat";
    return diff > 0 ? "up" : "down";
  }

  function avgVal(key: keyof Session, dec: number): string {
    const vals = sessions.map((s) => s[key] as number | null).filter((v) => v != null) as number[];
    if (!vals.length) return "—";
    return fv(vals.reduce((a, b) => a + b, 0) / vals.length, dec);
  }

  function maxVal(key: keyof Session, dec: number): string {
    const vals = sessions.map((s) => s[key] as number | null).filter((v) => v != null) as number[];
    if (!vals.length) return "—";
    return fv(Math.max(...vals), dec);
  }

  // ── Test timelines ──────────────────────────────────────────────────────────
  const testTimelines = useMemo((): Map<string, TestTimeline> => {
    if (!selectedId) return new Map();
    const map = new Map<string, TestTimeline>();
    programmi
      .filter((p) => p.atletaId === selectedId && (p.tests?.length ?? 0) > 0)
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
      .forEach((p) => {
        (p.tests ?? []).forEach((t) => {
          const ev = extractTestValues(t);
          if (ev.single == null && ev.sx == null && ev.dx == null) return;
          const dateLabel = p.data
            ? new Date(p.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
            : "";
          const pt: TestPoint = { data: p.data ?? "", dateLabel, single: ev.single, sx: ev.sx, dx: ev.dx, altezza: (ev as any).altezza };
          if (!map.has(t.nome)) {
            map.set(t.nome, { points: [], unit: ev.unit, isBilateral: ev.isBilateral, color: TEST_COLORS[t.nome] ?? "#6b7280" });
          }
          map.get(t.nome)!.points.push(pt);
        });
      });
    return map;
  }, [programmi, selectedId]);

  const testTableRows = useMemo((): TestTableRow[] => {
    if (!selectedId) return [];
    const rows: TestTableRow[] = [];
    programmi
      .filter((p) => p.atletaId === selectedId && (p.tests?.length ?? 0) > 0)
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
      .forEach((p) => {
        const dateLabel = p.data
          ? new Date(p.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
          : "";
        (p.tests ?? []).forEach((t) => {
          rows.push({ data: p.data ?? "", dateLabel, infortunio: p.nome ?? "—", nomeTest: t.nome, risultato: formatTestResult(t) });
        });
      });
    return rows;
  }, [programmi, selectedId]);

  function lastTestVal(tl: TestTimeline, nome?: string): string {
    const last = tl.points[tl.points.length - 1];
    if (!last) return "—";
    if (nome === "Drop Jump") {
      const parts: string[] = [];
      if (last.single != null) parts.push(`RSI: ${last.single}`);
      if (last.altezza != null) parts.push(`Alt: ${last.altezza} cm`);
      return parts.join(" / ") || "—";
    }
    if (!tl.isBilateral) return last.single != null ? `${last.single} ${tl.unit}`.trim() : "—";
    const p: string[] = [];
    if (last.sx != null) p.push(`Sx ${last.sx}`);
    if (last.dx != null) p.push(`Dx ${last.dx}`);
    return (p.join(" / ") + (tl.unit ? ` ${tl.unit}` : "")) || "—";
  }

  function avgTestVal(tl: TestTimeline, nome?: string): string {
    if (nome === "Drop Jump") {
      const rsi = tl.points.map((p) => p.single).filter((v): v is number => v != null);
      const alt = tl.points.map((p) => p.altezza).filter((v): v is number => v != null);
      const parts: string[] = [];
      if (rsi.length) parts.push(`RSI: ${(rsi.reduce((a, b) => a + b, 0) / rsi.length).toFixed(2)}`);
      if (alt.length) parts.push(`Alt: ${(alt.reduce((a, b) => a + b, 0) / alt.length).toFixed(1)} cm`);
      return parts.join(" / ") || "—";
    }
    if (!tl.isBilateral) {
      const vs = tl.points.map((p) => p.single).filter((v): v is number => v != null);
      if (!vs.length) return "—";
      return (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1);
    }
    const sx = tl.points.map((p) => p.sx).filter((v): v is number => v != null);
    const dx = tl.points.map((p) => p.dx).filter((v): v is number => v != null);
    const p: string[] = [];
    if (sx.length) p.push(`Sx ${(sx.reduce((a, b) => a + b, 0) / sx.length).toFixed(1)}`);
    if (dx.length) p.push(`Dx ${(dx.reduce((a, b) => a + b, 0) / dx.length).toFixed(1)}`);
    return p.join(" / ") || "—";
  }

  function testTrend(tl: TestTimeline): "up" | "down" | "flat" | "none" {
    const vals = tl.isBilateral
      ? tl.points.map((p) => {
          const vs = [p.sx, p.dx].filter((v): v is number => v != null);
          return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
        }).filter((v): v is number => v != null)
      : tl.points.map((p) => p.single).filter((v): v is number => v != null);
    if (vals.length < 2) return "none";
    const diff = ((vals[vals.length - 1] - vals[vals.length - 2]) / (Math.abs(vals[vals.length - 2]) || 1)) * 100;
    if (Math.abs(diff) < 3) return "flat";
    return diff > 0 ? "up" : "down";
  }

  // ── PDF ─────────────────────────────────────────────────────────────────────
  function exportPdf() {
    if (!selectedAtleta || !sessions.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PW = 297, PH = 210, M = 14;

    function hexRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "");
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    }

    // Full header (first page), compact header (continuation pages)
    // Returns the y position where content can start
    const addHeader = (compact?: boolean): number => {
      if (compact) {
        doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...RED_RGB);
        doc.text(`U.S. Cremonese – Performance  ·  ${nd(selectedAtleta!)}`, M, 10);
        doc.setDrawColor(...RED_RGB); doc.setLineWidth(0.3);
        doc.line(M, 12.5, PW - M, 12.5);
        return 16;
      }
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(...RED_RGB);
      doc.text("U.S. Cremonese", M, 15);
      doc.setFontSize(9); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(...GRAY_RGB);
      doc.text("Rehab Area – Performance", M, 19);
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY_RGB);
      doc.text(`${nd(selectedAtleta!)}  ·  ${selectedAtleta!.categoria}`, M, 24);
      doc.setDrawColor(...RED_RGB); doc.setLineWidth(0.5);
      doc.line(M, 27, PW - M, 27);
      return 32;
    };

    // Draw a single line chart for metric m at position (cx, cy) with size (cw × ch)
    function drawChart(m: MetricDef, cx: number, cy: number, cw: number, ch: number) {
      const pts = sessions
        .map((s) => ({ label: s.dateLabel, v: s[m.key] as number | null }))
        .filter((p) => p.v !== null) as { label: string; v: number }[];
      if (pts.length < 2) return;

      const [cr, cg, cb] = hexRgb(m.color);
      const PAD = { top: 9, right: 4, bottom: 10, left: 17 };
      const iW = cw - PAD.left - PAD.right;
      const iH = ch - PAD.top - PAD.bottom;
      const n = pts.length;

      const vals = pts.map((p) => p.v);
      const dMin = Math.min(...vals);
      const dMax = Math.max(...vals);
      const dAvg = vals.reduce((a, b) => a + b, 0) / n;
      const dSpan = (dMax - dMin) * 0.12 || dMax * 0.1 || 1;
      const vMin = dMin - dSpan;
      const vMax = dMax + dSpan;
      const vRange = vMax - vMin;

      const px = (i: number) => cx + PAD.left + (i / Math.max(n - 1, 1)) * iW;
      const py = (v: number) => cy + PAD.top + (1 - (v - vMin) / vRange) * iH;
      const botY = cy + PAD.top + iH;

      // Card background + border
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, "F");
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.15);
      doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, "S");

      // Title (metric name + unit)
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(cr, cg, cb);
      doc.text(`${m.label}${m.unit ? ` (${m.unit})` : ""}`, cx + PAD.left, cy + 5.5);

      // Stats in top-right
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      const statStr = `Ult: ${fv(vals[n-1], m.dec)}  ·  Med: ${fv(dAvg, m.dec)}  ·  Max: ${fv(dMax, m.dec)}`;
      doc.text(statStr, cx + cw - PAD.right, cy + 5.5, { align: "right" });

      // Y grid + tick labels
      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        const gy = cy + PAD.top + t * iH;
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.15);
        doc.line(cx + PAD.left, gy, cx + cw - PAD.right, gy);
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(165, 165, 165);
        doc.text((vMax - t * vRange).toFixed(m.dec), cx + PAD.left - 1, gy + 1.5, { align: "right" });
      });

      // Area fill — lightened tint of the metric color
      const lr = Math.round(cr * 0.12 + 255 * 0.88);
      const lg = Math.round(cg * 0.12 + 255 * 0.88);
      const lb = Math.round(cb * 0.12 + 255 * 0.88);
      doc.setFillColor(lr, lg, lb);
      const segs: number[][] = [[0, py(pts[0].v) - botY]];
      for (let i = 1; i < n; i++) {
        segs.push([px(i) - px(i - 1), py(pts[i].v) - py(pts[i - 1].v)]);
      }
      segs.push([0, botY - py(pts[n - 1].v)]);
      doc.lines(segs, px(0), botY, [1, 1], "F", true);

      // Average dashed line
      doc.setDrawColor(cr, cg, cb);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(cx + PAD.left, py(dAvg), cx + cw - PAD.right, py(dAvg));
      doc.setLineDashPattern([], 0);

      // Main line
      doc.setDrawColor(cr, cg, cb);
      doc.setLineWidth(0.8);
      for (let i = 0; i < n - 1; i++) {
        doc.line(px(i), py(pts[i].v), px(i + 1), py(pts[i + 1].v));
      }

      // Dots (skip some when many points to avoid clutter)
      doc.setFillColor(cr, cg, cb);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.35);
      const dotStep = n <= 30 ? 1 : 2;
      pts.forEach((p, i) => {
        if (i % dotStep === 0) doc.circle(px(i), py(p.v), 0.9, "FD");
      });

      // X-axis date labels
      const lblStep = n <= 12 ? 1 : n <= 24 ? 2 : Math.ceil(n / 12);
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      pts.forEach((p, i) => {
        if (i % lblStep === 0) doc.text(p.label, px(i), cy + ch - 1, { align: "center" });
      });
    }

    // ── Pagina 1: header + tabella sessioni + tabella riepilogo ───────────────
    let y = addHeader();

    // Tabella sessioni (inizia nella pagina 1, può andare in overflow)
    const tblGps = activeMetrics.filter((m) => m.key !== "rpe" && m.key !== "interno" && m.key !== "durata");
    const tblBase = [METRICS.find((m) => m.key === "rpe")!, METRICS.find((m) => m.key === "interno")!]
      .filter(Boolean).filter((m) => activeMetrics.includes(m));
    const tblMetrics = [...tblBase, ...tblGps];
    // Data=18 + Infortunio=28 + Programma=38 + Fase=12 = 96 fixed
    const tblFixedW = 96;
    const tblMW = tblMetrics.length ? Math.floor((269 - tblFixedW) / tblMetrics.length) : 0;
    const tblCols: Record<number, any> = {
      0: { cellWidth: 18 },
      1: { cellWidth: 28, halign: "left" },
      2: { cellWidth: 38, halign: "left" },
      3: { cellWidth: 12, halign: "left" },
    };
    tblMetrics.forEach((_, i) => { tblCols[i + 4] = { cellWidth: tblMW }; });

    const sessionRows = sessions.map((s) => [
      s.dateLabel || s.data,
      s.infortunio || "—",
      s.nome || "—",
      s.fase || "—",
      ...tblMetrics.map((m) => fv(s[m.key] as number | null, m.dec)),
    ]);
    const avgRow = [
      "Valori medi", "", "", "",
      ...tblMetrics.map((m) => avgVal(m.key, m.dec)),
    ];

    autoTable(doc, {
      startY: y,
      head: [["Data", "Infortunio", "Programma", "Fase", ...tblMetrics.map((m) => `${m.shortLabel}${m.unit ? `\n(${m.unit})` : ""}`)]],
      body: [...sessionRows, avgRow],
      headStyles: { fillColor: DARK_RGB, textColor: 255, fontSize: 6.5, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 6.5, cellPadding: 1.8, halign: "center", valign: "middle", overflow: "linebreak" },
      columnStyles: tblCols,
      alternateRowStyles: { fillColor: [249, 249, 249] },
      margin: { left: M, right: M, top: 18 },
      didDrawPage: (() => {
        let first = true;
        return () => { if (first) { first = false; } else { addHeader(true); } };
      })(),
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === sessionRows.length) {
          data.cell.styles.fontStyle = "bolditalic";
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fillColor = [255, 235, 238];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ── Grafici — pagine successive alle tabelle ───────────────────────────
    const CHART_W = (269 - 6) / 2;
    const CHART_H = 48;
    const GAP_Y = 5;

    doc.addPage();
    y = addHeader(true);

    // ── Grafico carico interno (dual-axis: barre TL sinistra, linea RPE destra) ──
    const tlSessions = sessions.filter(
      (s) => s.rpe !== null || s.interno !== null
    );
    if (tlSessions.length >= 1) {
      const n = tlSessions.length;
      const cX = M;
      const cW = PW - 2 * M;
      const cH = 62;
      const cY = y;

      const PAD = { top: 8, right: 20, bottom: 12, left: 22 };
      const plotW = cW - PAD.left - PAD.right;
      const plotH = cH - PAD.top - PAD.bottom;

      const tlVals = tlSessions.map((s) => s.interno).filter((v): v is number => v !== null);
      const rawMaxTL = tlVals.length ? Math.max(...tlVals) : 400;
      const maxTL = Math.ceil(rawMaxTL / 100) * 100 || 100;
      const maxRPE = 10;

      const bX = (i: number) => cX + PAD.left + (i + 0.5) * (plotW / n);
      const barW = Math.min((plotW / n) * 0.6, 16);
      const tlY  = (v: number) => cY + PAD.top + (1 - v / maxTL)  * plotH;
      const rpeY = (v: number) => cY + PAD.top + (1 - v / maxRPE) * plotH;

      // Card background
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(cX, cY, cW, cH, 1.5, 1.5, "F");
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.15);
      doc.roundedRect(cX, cY, cW, cH, 1.5, 1.5, "S");

      // Title
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK_RGB);
      doc.text("Andamento Training Load", cX + PAD.left, cY + 5.5);

      // Y grid lines
      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        const gy = cY + PAD.top + t * plotH;
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.12);
        doc.line(cX + PAD.left, gy, cX + cW - PAD.right, gy);
      });

      // Left Y-axis: Training Load (dark)
      for (let t = 0; t <= 4; t++) {
        const tlv = Math.round((maxTL / 4) * t);
        const gy = tlY(tlv);
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK_RGB);
        doc.text(String(tlv), cX + PAD.left - 1.5, gy + 1.2, { align: "right" });
      }
      doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK_RGB);
      doc.text("TL (UA)", cX + PAD.left - 1.5, cY + PAD.top - 1, { align: "right" });

      // Right Y-axis: RPE (red, 0-10)
      [0, 2, 4, 6, 8, 10].forEach((v) => {
        const gy = rpeY(v);
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...RED_RGB);
        doc.text(String(v), cX + cW - PAD.right + 1.5, gy + 1.2);
      });
      doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...RED_RGB);
      doc.text("RPE", cX + cW - PAD.right + 1.5, cY + PAD.top - 1);

      // Bars: Training Load (dark navy/slate)
      tlSessions.forEach((s, i) => {
        if (s.interno === null) return;
        const bh = (s.interno / maxTL) * plotH;
        const bx = bX(i) - barW / 2;
        const by = cY + PAD.top + plotH - bh;
        doc.setFillColor(55, 65, 81);
        doc.setDrawColor(37, 47, 63);
        doc.setLineWidth(0.15);
        doc.rect(bx, by, barW, bh, "FD");
      });

      // RPE line (right axis, red solid) + dots + value labels
      doc.setDrawColor(...RED_RGB);
      doc.setLineWidth(0.9);
      doc.setLineDashPattern([], 0);
      for (let i = 0; i < n - 1; i++) {
        const s0 = tlSessions[i], s1 = tlSessions[i + 1];
        if (s0.rpe !== null && s1.rpe !== null) {
          doc.line(bX(i), rpeY(s0.rpe), bX(i + 1), rpeY(s1.rpe));
        }
      }
      tlSessions.forEach((s, i) => {
        if (s.rpe === null) return;
        doc.setFillColor(...RED_RGB);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.3);
        doc.circle(bX(i), rpeY(s.rpe), 1, "FD");
        const barTopP = s.interno !== null ? cY + PAD.top + (1 - s.interno / maxTL) * plotH : cY + PAD.top;
        const insideBarP = rpeY(s.rpe) - 2 >= barTopP;
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...(insideBarP ? ([255, 255, 255] as [number, number, number]) : RED_RGB));
        doc.text(s.rpe.toFixed(1), bX(i), rpeY(s.rpe) - 2, { align: "center" });
      });

      // X-axis date labels
      const lblStep = n <= 20 ? 1 : Math.ceil(n / 20);
      tlSessions.forEach((s, i) => {
        if (i % lblStep !== 0) return;
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(s.dateLabel || s.data, bX(i), cY + cH - 1, { align: "center" });
      });

      // Legend
      const legY = cY + cH - 5;
      const legX = cX + PAD.left;
      // TL bar swatch
      doc.setFillColor(55, 65, 81); doc.setDrawColor(37, 47, 63); doc.setLineWidth(0.15);
      doc.rect(legX, legY - 2.5, 4, 2.5, "FD");
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      doc.text("Training Load (UA)", legX + 5.5, legY);
      // RPE line swatch
      doc.setDrawColor(...RED_RGB); doc.setLineWidth(0.9); doc.setLineDashPattern([], 0);
      doc.line(legX + 46, legY - 1.2, legX + 50, legY - 1.2);
      doc.setFillColor(...RED_RGB); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.3);
      doc.circle(legX + 48, legY - 1.2, 0.9, "FD");
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      doc.text("RPE (scala 0-10)", legX + 51.5, legY);

      y = cY + cH + GAP_Y;
    }

    const chartMetrics = activeMetrics.filter((m) => m.key !== "rpe" && m.key !== "interno" && m.key !== "durata");
    for (let i = 0; i < chartMetrics.length; i += 2) {
      if (y + CHART_H > PH - M) {
        doc.addPage();
        y = addHeader(true);
      }
      drawChart(chartMetrics[i], M, y, CHART_W, CHART_H);
      if (i + 1 < chartMetrics.length) {
        drawChart(chartMetrics[i + 1], M + CHART_W + 6, y, CHART_W, CHART_H);
      }
      y += CHART_H + GAP_Y;
    }

    // ── Test table ─────────────────────────────────────────────────────────────
    if (testTableRows.length > 0) {
      doc.addPage();
      let ty = addHeader(true);
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK_RGB);
      doc.text("Test", M, ty + 2);
      ty += 7;
      autoTable(doc, {
        startY: ty,
        head: [["Data", "Infortunio", "Test", "Risultato"]],
        body: testTableRows.map((r) => [r.dateLabel, r.infortunio, r.nomeTest, r.risultato]),
        headStyles: { fillColor: DARK_RGB, textColor: 255, fontSize: 6.5, halign: "center", valign: "middle" },
        bodyStyles: { fontSize: 6.5, cellPadding: 1.8, overflow: "linebreak" as const, valign: "middle" as const },
        alternateRowStyles: { fillColor: [249, 249, 249] },
        margin: { left: M, right: M, top: 18 },
        columnStyles: {
          0: { cellWidth: 18, halign: "center" as const },
          1: { cellWidth: 45 },
          2: { cellWidth: 65 },
          3: { cellWidth: "auto" as any },
        },
        didDrawPage: (() => { let first = true; return () => { if (first) first = false; else addHeader(true); }; })(),
      });
    }

    // Page numbers
    const pages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY_RGB);
      doc.text(`${p} / ${pages}`, PW - M, 205, { align: "right" });
    }

    doc.save(`performance_${nd(selectedAtleta!).replace(/ /g, "_")}.pdf`);
  }

  // ── Trend icon ───────────────────────────────────────────────────────────────
  function TrendIcon({ t }: { t: ReturnType<typeof trend> }) {
    if (t === "up") return <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />;
    if (t === "down") return <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />;
    if (t === "flat") return <Minus className="w-4 h-4 text-gray-400 shrink-0" />;
    return null;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Caricamento…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: RED }}>
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Performance</h1>
              <p className="text-sm text-gray-500">Test, andamento GPS e carico in riabilitazione</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setView("grafici")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === "grafici" ? "text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
                style={view === "grafici" ? { backgroundColor: RED } : {}}
              >
                <BarChart3 className="w-4 h-4" />
                Grafici
              </button>
              <button
                onClick={() => setView("tabella")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === "tabella" ? "text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
                style={view === "tabella" ? { backgroundColor: RED } : {}}
              >
                <Table2 className="w-4 h-4" />
                Tabella
              </button>
            </div>

            {/* PDF */}
            <button
              onClick={exportPdf}
              disabled={!selectedAtleta || sessions.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: RED }}
            >
              <FileDown className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Athlete selector ─────────────────────────────────────────────────── */}
      {atletiConDati.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
          <div className="flex items-center gap-2 max-w-md">
            <button
              onClick={() => idx > 0 && setSelectedId(atletiConDati[idx - 1].id)}
              disabled={idx <= 0}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer"
            >
              <option value="">— Seleziona atleta —</option>
              {atletiConDati.map((a) => (
                <option key={a.id} value={a.id}>
                  {nd(a)}{a.categoria ? ` — ${a.categoria}` : ""}
                </option>
              ))}
            </select>

            <button
              onClick={() => idx < atletiConDati.length - 1 && setSelectedId(atletiConDati[idx + 1].id)}
              disabled={idx >= atletiConDati.length - 1}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Empty states */}
        {atletiConDati.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Activity className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">Nessun dato GPS disponibile</p>
            <p className="text-gray-400 text-sm mt-1">Inserisci i dati GPS nella sezione Programmi</p>
          </div>
        )}

        {atletiConDati.length > 0 && sessions.length === 0 && testTimelines.size === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Activity className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">Nessun dato per questo atleta</p>
          </div>
        )}

        {(sessions.length > 0 || testTimelines.size > 0) && (
          <>
            {/* ── GPS KPI strip ──────────────────────────────────────────────── */}
            {sessions.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">GPS e Carico</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Sessioni</p>
                    <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
                  </div>
                  {activeMetrics.map((m) => {
                    const t = trend(m.key);
                    return (
                      <div key={m.key} className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                          {m.shortLabel}{m.unit && ` (${m.unit})`}
                        </p>
                        <div className="flex items-end gap-1.5">
                          <span className="text-2xl font-bold text-gray-900">{lastVal(m.key, m.dec)}</span>
                          <TrendIcon t={t} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">media {avgVal(m.key, m.dec)}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Test KPI strip ─────────────────────────────────────────────── */}
            {testTimelines.size > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-1">Test</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
                  {Array.from(testTimelines.entries()).map(([nome, tl]) => {
                    const t = testTrend(tl);
                    const last = tl.points[tl.points.length - 1];
                    const showBilateral = tl.isBilateral && nome !== "Drop Jump";
                    const asymPct = showBilateral && nome !== "QSLS" && last?.sx != null && last?.dx != null && Math.max(last.sx, last.dx) > 0
                      ? ((Math.abs(last.sx - last.dx) / Math.max(last.sx, last.dx)) * 100).toFixed(1)
                      : null;
                    return (
                      <div key={nome} className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 truncate" title={nome}>{nome}</p>
                        {showBilateral ? (
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              {last?.sx != null && <span className="text-base font-bold text-blue-600">Sx {last.sx}</span>}
                              {last?.dx != null && <span className="text-base font-bold text-red-500">Dx {last.dx}</span>}
                              {tl.unit && (last?.sx != null || last?.dx != null) && <span className="text-xs text-gray-400">{tl.unit}</span>}
                              <TrendIcon t={t} />
                            </div>
                            {asymPct && <p className="text-xs font-semibold text-orange-500">Δ {asymPct}%</p>}
                          </div>
                        ) : (
                          <div className="flex items-end gap-1.5 flex-wrap">
                            <span className="text-lg font-bold text-gray-900 leading-tight">{lastTestVal(tl, nome)}</span>
                            <TrendIcon t={t} />
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">media {avgTestVal(tl, nome)}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── GRAFICI ────────────────────────────────────────────────────── */}
            {view === "grafici" && (
              <>
                {sessions.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    {activeMetrics.map((m) => {
                      const t = trend(m.key);
                      const isExpanded = expandedKey === m.key;
                      return (
                        <div
                          key={m.key}
                          className={`bg-white rounded-xl border border-gray-200 p-4 ${isExpanded ? "lg:col-span-2" : ""}`}
                        >
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                                <span className="font-semibold text-gray-800 text-sm">{m.label}</span>
                                {m.unit && (
                                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{m.unit}</span>
                                )}
                              </div>
                              <button
                                onClick={() => setExpandedKey(isExpanded ? null : m.key)}
                                className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
                              >
                                {isExpanded ? "Riduci ↙" : "Espandi ↗"}
                              </button>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Ultimo</span>
                                <span className="text-base font-bold" style={{ color: m.color }}>{lastVal(m.key, m.dec)}</span>
                                <TrendIcon t={t} />
                              </div>
                              <div className="w-px h-4 bg-gray-200" />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">Media</span>
                                <span className="text-sm font-semibold text-gray-700">{avgVal(m.key, m.dec)}</span>
                              </div>
                              <div className="w-px h-4 bg-gray-200" />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">Max</span>
                                <span className="text-sm font-semibold text-gray-700">{maxVal(m.key, m.dec)}</span>
                              </div>
                            </div>
                          </div>
                          <MetricChart sessions={sessions} metric={m} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {testTimelines.size > 0 && (
                  <>
                    {sessions.length > 0 && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Grafici Test</p>}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {Array.from(testTimelines.entries()).filter(([n]) => n !== "Gacon" && n !== "IFT 30-15").map(([nome, tl]) => {
                        const t = testTrend(tl);
                        const ek = `test-${nome}`;
                        const isExpanded = expandedKey === ek;
                        return (
                          <div key={nome} className={`bg-white rounded-xl border border-gray-200 p-4 ${isExpanded ? "lg:col-span-2" : ""}`}>
                            <div className="mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tl.color }} />
                                  <span className="font-semibold text-gray-800 text-sm">{nome}</span>
                                  {tl.unit && nome !== "Drop Jump" && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{tl.unit}</span>}
                                  {tl.isBilateral && <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Sx / Dx</span>}
                                </div>
                                <button
                                  onClick={() => setExpandedKey(isExpanded ? null : ek)}
                                  className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
                                >
                                  {isExpanded ? "Riduci ↙" : "Espandi ↗"}
                                </button>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Ultimo</span>
                                  <span className="text-base font-bold" style={{ color: tl.color }}>{lastTestVal(tl, nome)}</span>
                                  <TrendIcon t={t} />
                                </div>
                                <div className="w-px h-4 bg-gray-200" />
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-400">Media</span>
                                  <span className="text-sm font-semibold text-gray-700">{avgTestVal(tl, nome)}</span>
                                </div>
                                <div className="w-px h-4 bg-gray-200" />
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-400">N.</span>
                                  <span className="text-sm font-semibold text-gray-700">{tl.points.length}</span>
                                </div>
                              </div>
                            </div>
                            <TestLineChart points={tl.points} color={tl.color} isBilateral={tl.isBilateral} unit={tl.unit} />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── TABELLA ────────────────────────────────────────────────────── */}
            {view === "tabella" && (
              <div className="space-y-4">
              {sessions.length > 0 && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">GPS e Carico</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {["Data", "Infortunio", "Programma", "Fase"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                        {activeMetrics.map((m) => (
                          <th key={m.key} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            {m.shortLabel}
                            {m.unit && <span className="text-gray-400 lowercase font-normal"> {m.unit}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...sessions].reverse().map((s, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs font-mono">
                            {s.data ? new Date(s.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[120px] truncate">{s.infortunio || "—"}</td>
                          <td className="px-4 py-2.5 text-gray-800 font-medium max-w-[160px] truncate">{s.nome || "—"}</td>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{s.fase || "—"}</td>
                          {activeMetrics.map((m) => {
                            const v = s[m.key] as number | null;
                            return (
                              <td key={m.key} className="px-3 py-2.5 text-center whitespace-nowrap">
                                {v != null ? (
                                  <span className="font-mono text-gray-800 text-xs">{fv(v, m.dec)}</span>
                                ) : (
                                  <span className="text-gray-300 text-xs">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>

                    {/* Footer: averages */}
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" colSpan={4}>
                          Media
                        </td>
                        {activeMetrics.map((m) => (
                          <td key={m.key} className="px-3 py-2.5 text-center">
                            <span className="text-xs font-semibold text-gray-600">{avgVal(m.key, m.dec)}</span>
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" colSpan={4}>
                          Massimo
                        </td>
                        {activeMetrics.map((m) => (
                          <td key={m.key} className="px-3 py-2.5 text-center">
                            <span className="text-xs font-semibold text-gray-600">{maxVal(m.key, m.dec)}</span>
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>}

              {testTableRows.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Test</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {["Data", "Infortunio", "Test", "Risultato"].map((h) => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...testTableRows].reverse().map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs font-mono">{r.dateLabel}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[140px] truncate">{r.infortunio}</td>
                            <td className="px-4 py-2.5 text-gray-800 font-medium text-xs whitespace-nowrap">{r.nomeTest}</td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs">{r.risultato}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
