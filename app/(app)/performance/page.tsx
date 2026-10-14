"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Activity, BarChart3, FileDown, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Dumbbell,
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

const MUSCLE_COLORS: Record<string, string> = {
  "Quadricipiti": "#2563eb", "Glutei": "#7c3aed", "Ischiocrurali": "#059669",
  "Core": "#d97706", "Polpacci": "#0891b2", "Spalle": "#ea580c",
  "Petto": "#dc2626", "Dorsali": "#6d28d9", "Bicipiti": "#0d9488",
  "Tricipiti": "#64748b", "Mobilità": "#16a34a",
};

const MUSCLE_KEYWORD_MAP: Array<{ chiavi: string[]; gruppo: string }> = [
  { chiavi: ["squat","leg press","pressa","affondi","lunge","leg extension","front squat","hack squat","step up","step down","bulgaro","bulgarian","pistol","split squat","goblet"], gruppo: "Quadricipiti" },
  { chiavi: ["hip thrust","glute bridge","bridge","glutei","abductor","abduttori","kickback","fire hydrant","clamshell","frog pump","hip abduction"], gruppo: "Glutei" },
  { chiavi: ["leg curl","nordic","hamstring","ischiocrurali","rdl","romanian","stiff","good morning","deadlift","stacchi","ghr","nordic curl","reverse nordic"], gruppo: "Ischiocrurali" },
  { chiavi: ["plank","core","addome","crunch","sit up","russian twist","pallof","dead bug","bird dog","addominali","hollow","v-up","mountain climber","hyperextension","back extension"], gruppo: "Core" },
  { chiavi: ["calf","polpacci","soleus","soleo","gastrocnemio"], gruppo: "Polpacci" },
  { chiavi: ["shoulder","spalle","deltoide","lateral raise","alzate laterali","overhead press","military press","arnold","upright row","face pull","alzate"], gruppo: "Spalle" },
  { chiavi: ["panca","bench","petto","pettorali","push up","chest","fly","pec deck","dips"], gruppo: "Petto" },
  { chiavi: ["trazioni","pull up","pulldown","lat machine","lat pull","rematore","rowing","dorsali","back","seated row","t-bar","cable row"], gruppo: "Dorsali" },
  { chiavi: ["curl","bicipiti","bicep","concentration","preacher","hammer curl","spider curl"], gruppo: "Bicipiti" },
  { chiavi: ["tricipiti","tricep","french press","skull crusher","pushdown","overhead tricep"], gruppo: "Tricipiti" },
  { chiavi: ["elastici","band","propriocettivo","balance","bosu","stretching","mobilità","foam roll","mobilizzazione","tkе","tke","slr"], gruppo: "Mobilità" },
];

function rilevGruppoPerf(nome: string): string {
  const lower = nome.toLowerCase();
  for (const { chiavi, gruppo } of MUSCLE_KEYWORD_MAP) {
    if (chiavi.some((k) => lower.includes(k))) return gruppo;
  }
  return "";
}

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
  altezza?: number;
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
  { key: "rpe",      label: "RPE",                shortLabel: "RPE",        unit: "",     color: "#C8102E", dec: 1 },
  { key: "durata",   label: "Durata",             shortLabel: "Durata",     unit: "min",  color: "#64748b", dec: 0 },
  { key: "interno",  label: "Carico Interno",      shortLabel: "TL",         unit: "UA",   color: "#7c3aed", dec: 0 },
  { key: "distanza", label: "Distanza Totale",     shortLabel: "Dist. Tot.", unit: "m",    color: "#2563eb", dec: 0 },
  { key: "hsr",      label: "D>16 km/h",          shortLabel: "D>16 km/h",  unit: "m",    color: "#0891b2", dec: 0 },
  { key: "vel21",    label: "D>20 km/h",          shortLabel: "D>20 km/h",  unit: "m",    color: "#059669", dec: 0 },
  { key: "vel25",    label: "D>25 km/h",          shortLabel: "D>25 km/h",  unit: "m",    color: "#d97706", dec: 0 },
  { key: "velMax",   label: "Velocità Max",        shortLabel: "Vel. Max",   unit: "km/h", color: "#ea580c", dec: 1 },
  { key: "acc",      label: "Accelerazioni",       shortLabel: "N. Acc.",    unit: "",     color: "#6d28d9", dec: 0 },
  { key: "dec",      label: "Decelerazioni",       shortLabel: "N. Dec.",    unit: "",     color: "#db2777", dec: 0 },
  { key: "sprint",   label: "Sprint",              shortLabel: "N. Sprint",  unit: "",     color: "#C8102E", dec: 0 },
  { key: "potenza",  label: "Potenza Metabolica",  shortLabel: "Potenza",    unit: "W/kg", color: "#0d9488", dec: 1 },
];

const GPS_GROUPS: Array<{ label: string; keys: string[]; color: string }> = [
  { label: "Carico Interno",  keys: ["rpe", "interno", "durata"],               color: "#7c3aed" },
  { label: "Volume",          keys: ["distanza", "hsr", "vel21", "vel25"],      color: "#2563eb" },
  { label: "Velocità",        keys: ["velMax", "sprint"],                        color: "#ea580c" },
  { label: "Intensità",       keys: ["acc", "dec", "potenza"],                  color: "#6d28d9" },
];

const TEST_CATEGORIES: Array<{ label: string; keys: string[]; color: string }> = [
  {
    label: "Salto Verticale e Orizzontale",
    color: "#7c3aed",
    keys: [
      "CMJ – Counter Movement Jump", "CMJ braccia libere", "Squat Jump",
      "SL CMJ", "Drop Jump", "SL Drop Jump",
      "Broad Jump", "Single Leg Hop Test", "Triple Hop Test",
      "6m Timed Hop Test", "Crossover Hop Test", "Side Hop Test",
    ],
  },
  {
    label: "Forza",
    color: "#C8102E",
    keys: [
      "Forza hamstring (dinamometro)", "Forza hamstring HHD 30°", "Forza hamstring HHD 90°",
      "Forza quadricipite (dinamometro)", "Isokinetic 60°/s", "Isokinetic 180°/s", "Isokinetic 240°/s",
      "Jurdan", "McCall 90º/20º", "McCall 60º/60º", "Rapporto H/Q",
      "Limb Symmetry Index", "Single Leg Press", "Squeeze",
    ],
  },
  {
    label: "Mobilità e Qualità del Movimento",
    color: "#059669",
    keys: [
      "Dorsiflexion Lunge Test", "FMS", "Heel Rise Test", "Lunge test", "MHFAKE", "PKE",
      "ROM anca – flessione", "ROM caviglia – dorsiflessione",
      "ROM ginocchio – estensione", "ROM ginocchio – flessione",
      "SEBT", "SLR", "Single Leg Squat", "QSLS",
      "Y-Balance Test – Anteriore", "Y-Balance Test – Posterolaterale", "Y-Balance Test – Posteromediale",
    ],
  },
  {
    label: "Velocità e Agilità",
    color: "#ea580c",
    keys: ["Sprint 10m", "Sprint 20m", "Sprint 30m", "505 Agility Test", "Illinois Agility Test", "IFT 30-15", "Gacon", "10x100m"],
  },
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
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#e5e7eb" strokeWidth="0.8" />
          <text x={PAD.left - 4} y={t.y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{t.label}</text>
        </g>
      ))}
      <line x1={PAD.left} y1={toY(avg)} x2={W - PAD.right} y2={toY(avg)}
        stroke={metric.color} strokeWidth="0.9" strokeDasharray="5,4" opacity="0.4" />
      <polygon points={areaPts} fill={`url(#${gradId})`} />
      <polyline points={linePts} fill="none" stroke={metric.color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={toX(p.i)} cy={toY(p.v)} r="4" fill={metric.color} stroke="white" strokeWidth="1.5" />
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
  const [tab, setTab] = useState<"gps" | "test" | "palestra">("gps");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedTestKey, setExpandedTestKey] = useState<string | null>(null);

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

  const atletiConDati = useMemo(() => {
    const ids = new Set(
      programmi.filter((p) =>
        toSession(p) !== null ||
        (p.tests?.length ?? 0) > 0 ||
        (p.esercizi?.some((e) => e.nome.trim()) ?? false)
      ).map((p) => p.atletaId)
    );
    return atleti
      .filter((a) => ids.has(a.id) && (a.stato === "Infortunato" || a.stato === "NTL"))
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

  const activeMetrics = METRICS.filter((m) => sessions.some((s) => s[m.key] != null));

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

  function calcPointTrend(pt: TestPoint, prev: TestPoint | undefined, isBilateral: boolean): "up" | "down" | "flat" | "none" {
    if (!prev) return "none";
    const getVal = (p: TestPoint) => {
      if (!isBilateral) return p.single;
      const vs = [p.sx, p.dx].filter((v): v is number => v != null);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : undefined;
    };
    const cv = getVal(pt), pv = getVal(prev);
    if (cv == null || pv == null) return "none";
    const diff = ((cv - pv) / (Math.abs(pv) || 1)) * 100;
    if (Math.abs(diff) < 3) return "flat";
    return diff > 0 ? "up" : "down";
  }

  // ── Gym analytics ─────────────────────────────────────────────────────────
  const gymStats = useMemo(() => {
    if (!selectedId) return null;
    const progs = programmi
      .filter((p) => p.atletaId === selectedId && !p.assente && !p.riposo && !p.squadra && (p.esercizi?.length ?? 0) > 0)
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));

    if (!progs.length) return null;

    const sessioni = progs.map((p) => {
      let volume = 0, tonnaggio = 0;
      const gruppi: Record<string, number> = {};
      (p.esercizi ?? []).forEach((e) => {
        const s = parseInt(e.serie) || 0;
        const r = parseInt(e.reps) || 0;
        const c = parseFloat(e.carico) || 0;
        volume += s * r;
        tonnaggio += c;
        const g = e.gruppoMuscolare?.trim() || rilevGruppoPerf(e.nome ?? "");
        if (g) gruppi[g] = (gruppi[g] ?? 0) + s;
      });
      const dateLabel = p.data ? new Date(p.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "";
      return { data: p.data ?? "", dateLabel, nome: p.nome ?? "", volume, tonnaggio, gruppi };
    });

    const gruppiTotali: Record<string, number> = {};
    sessioni.forEach((s) => Object.entries(s.gruppi).forEach(([g, v]) => { gruppiTotali[g] = (gruppiTotali[g] ?? 0) + v; }));

    const totaleSerie = Object.values(gruppiTotali).reduce((a, b) => a + b, 0);
    const sliceGruppi = Object.entries(gruppiTotali)
      .sort((a, b) => b[1] - a[1])
      .map(([g, v]) => ({ gruppo: g, serie: v, pct: totaleSerie > 0 ? Math.round((v / totaleSerie) * 100) : 0 }));

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    const ultimaSettimana = sessioni.filter((s) => s.data >= cutoff.toISOString().slice(0, 10));
    const tonnSettimana = ultimaSettimana.reduce((a, s) => a + s.tonnaggio, 0);
    const volSettimana = ultimaSettimana.reduce((a, s) => a + s.volume, 0);

    return { sessioni, sliceGruppi, tonnSettimana, volSettimana };
  }, [programmi, selectedId]);

  // ── PDF ─────────────────────────────────────────────────────────────────────
  function exportPdf() {
    if (!selectedAtleta || !sessions.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PW = 297, PH = 210, M = 14;

    function hexRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "");
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    }

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
      const dMin = Math.min(...vals), dMax = Math.max(...vals);
      const dAvg = vals.reduce((a, b) => a + b, 0) / n;
      const dSpan = (dMax - dMin) * 0.12 || dMax * 0.1 || 1;
      const vMin = dMin - dSpan, vMax = dMax + dSpan, vRange = vMax - vMin;
      const px = (i: number) => cx + PAD.left + (i / Math.max(n - 1, 1)) * iW;
      const py = (v: number) => cy + PAD.top + (1 - (v - vMin) / vRange) * iH;
      const botY = cy + PAD.top + iH;
      const GRID_C: [number, number, number] = [232, 234, 238];
      const AXIS_C: [number, number, number] = [140, 145, 155];
      const AVG_C: [number, number, number] = [185, 190, 200];

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, "F");
      doc.setDrawColor(225, 227, 232); doc.setLineWidth(0.25);
      doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, "S");
      doc.setFillColor(cr, cg, cb);
      doc.roundedRect(cx, cy, 2, ch, 1, 1, "F");
      doc.setFillColor(255, 255, 255);
      doc.rect(cx + 1, cy, 1.5, ch, "F");
      doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(cr, cg, cb);
      doc.text(`${m.label}${m.unit ? ` (${m.unit})` : ""}`, cx + PAD.left, cy + 5.5);
      doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(...AXIS_C);
      doc.text(`Ult: ${fv(vals[n-1], m.dec)}  ·  Med: ${fv(dAvg, m.dec)}  ·  Max: ${fv(dMax, m.dec)}`, cx + cw - PAD.right, cy + 5.5, { align: "right" });

      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        const gy = cy + PAD.top + t * iH;
        doc.setDrawColor(...GRID_C); doc.setLineWidth(0.15);
        doc.line(cx + PAD.left, gy, cx + cw - PAD.right, gy);
        doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...AXIS_C);
        doc.text((vMax - t * vRange).toFixed(m.dec), cx + PAD.left - 1, gy + 1.5, { align: "right" });
      });

      const tension = 0.25;
      const smoothCp = (i: number) => {
        const xi = (k: number) => px(Math.max(0, Math.min(n - 1, k)));
        const yi = (k: number) => py(pts[Math.max(0, Math.min(n - 1, k))].v);
        return {
          cp1x: xi(i)     + (xi(i + 1) - xi(i - 1)) * tension,
          cp1y: yi(i)     + (yi(i + 1) - yi(i - 1)) * tension,
          cp2x: xi(i + 1) - (xi(i + 2) - xi(i))     * tension,
          cp2y: yi(i + 1) - (yi(i + 2) - yi(i))     * tension,
        };
      };

      const ar = Math.round(cr * 0.10 + 255 * 0.90);
      const ag = Math.round(cg * 0.10 + 255 * 0.90);
      const ab = Math.round(cb * 0.10 + 255 * 0.90);
      doc.setFillColor(ar, ag, ab);
      doc.moveTo(px(0), botY); doc.lineTo(px(0), py(pts[0].v));
      for (let i = 0; i < n - 1; i++) {
        const { cp1x, cp1y, cp2x, cp2y } = smoothCp(i);
        doc.curveTo(cp1x, cp1y, cp2x, cp2y, px(i + 1), py(pts[i + 1].v));
      }
      doc.lineTo(px(n - 1), botY); doc.fill();

      doc.setDrawColor(...AVG_C); doc.setLineWidth(0.4); doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(cx + PAD.left, py(dAvg), cx + cw - PAD.right, py(dAvg));
      doc.setLineDashPattern([], 0);

      doc.setDrawColor(cr, cg, cb); doc.setLineWidth(0.85);
      doc.moveTo(px(0), py(pts[0].v));
      for (let i = 0; i < n - 1; i++) {
        const { cp1x, cp1y, cp2x, cp2y } = smoothCp(i);
        doc.curveTo(cp1x, cp1y, cp2x, cp2y, px(i + 1), py(pts[i + 1].v));
      }
      doc.stroke();

      doc.setFillColor(cr, cg, cb); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.35);
      const dotStep = n <= 30 ? 1 : 2;
      pts.forEach((p, i) => { if (i % dotStep === 0) doc.circle(px(i), py(p.v), 0.9, "FD"); });

      const lblStep = n <= 12 ? 1 : n <= 24 ? 2 : Math.ceil(n / 12);
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...AXIS_C);
      pts.forEach((p, i) => { if (i % lblStep === 0) doc.text(p.label, px(i), cy + ch - 1, { align: "center" }); });
    }

    let y = addHeader();

    const tblGps = activeMetrics.filter((m) => m.key !== "rpe" && m.key !== "interno" && m.key !== "durata");
    const tblBase = [METRICS.find((m) => m.key === "rpe")!, METRICS.find((m) => m.key === "interno")!]
      .filter(Boolean).filter((m) => activeMetrics.includes(m));
    const tblMetrics = [...tblBase, ...tblGps];
    const tblFixedW = 96;
    const tblMW = tblMetrics.length ? Math.floor((269 - tblFixedW) / tblMetrics.length) : 0;
    const tblCols: Record<number, any> = {
      0: { cellWidth: 18 }, 1: { cellWidth: 28, halign: "left" },
      2: { cellWidth: 38, halign: "left" }, 3: { cellWidth: 12, halign: "left" },
    };
    tblMetrics.forEach((_, i) => { tblCols[i + 4] = { cellWidth: tblMW }; });

    const sessionRows = sessions.map((s) => [
      s.dateLabel || s.data, s.infortunio || "—", s.nome || "—", s.fase || "—",
      ...tblMetrics.map((m) => fv(s[m.key] as number | null, m.dec)),
    ]);
    const avgRow = ["Valori medi", "", "", "", ...tblMetrics.map((m) => avgVal(m.key, m.dec))];

    autoTable(doc, {
      startY: y,
      head: [["Data", "Infortunio", "Programma", "Fase", ...tblMetrics.map((m) => `${m.shortLabel}${m.unit ? `\n(${m.unit})` : ""}`)]],
      body: [...sessionRows, avgRow],
      headStyles: { fillColor: DARK_RGB, textColor: 255, fontSize: 6.5, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 6.5, cellPadding: 1.8, halign: "center", valign: "middle", overflow: "linebreak" },
      columnStyles: tblCols,
      alternateRowStyles: { fillColor: [249, 249, 249] },
      margin: { left: M, right: M, top: 18 },
      didDrawPage: (() => { let first = true; return () => { if (first) { first = false; } else { addHeader(true); } }; })(),
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === sessionRows.length) {
          data.cell.styles.fontStyle = "bolditalic";
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fillColor = [255, 235, 238];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    const CHART_W = (269 - 6) / 2;
    const CHART_H = 48;
    const GAP_Y = 5;

    doc.addPage();
    y = addHeader(true);

    const tlSessions = sessions.filter((s) => s.rpe !== null || s.interno !== null);
    if (tlSessions.length >= 1) {
      const n = tlSessions.length;
      const cX = M, cW = PW - 2 * M, cH = 62, cY = y;
      const PAD = { top: 8, right: 20, bottom: 12, left: 22 };
      const plotW = cW - PAD.left - PAD.right, plotH = cH - PAD.top - PAD.bottom;
      const tlVals = tlSessions.map((s) => s.interno).filter((v): v is number => v !== null);
      const rawMaxTL = tlVals.length ? Math.max(...tlVals) : 400;
      const maxTL = Math.ceil(rawMaxTL / 100) * 100 || 100;
      const maxRPE = 10;
      const bX = (i: number) => cX + PAD.left + (i + 0.5) * (plotW / n);
      const barW = Math.min((plotW / n) * 0.6, 16);
      const tlY = (v: number) => cY + PAD.top + (1 - v / maxTL) * plotH;
      const rpeY = (v: number) => cY + PAD.top + (1 - v / maxRPE) * plotH;

      doc.setFillColor(249, 250, 251);
      doc.roundedRect(cX, cY, cW, cH, 1.5, 1.5, "F");
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.15);
      doc.roundedRect(cX, cY, cW, cH, 1.5, 1.5, "S");
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK_RGB);
      doc.text("Andamento Training Load", cX + PAD.left, cY + 5.5);

      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        const gy = cY + PAD.top + t * plotH;
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.12);
        doc.line(cX + PAD.left, gy, cX + cW - PAD.right, gy);
      });
      for (let t = 0; t <= 4; t++) {
        const tlv = Math.round((maxTL / 4) * t), gy = tlY(tlv);
        doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK_RGB);
        doc.text(String(tlv), cX + PAD.left - 1.5, gy + 1.2, { align: "right" });
      }
      doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK_RGB);
      doc.text("TL (UA)", cX + PAD.left - 1.5, cY + PAD.top - 1, { align: "right" });
      [0, 2, 4, 6, 8, 10].forEach((v) => {
        const gy = rpeY(v);
        doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...RED_RGB);
        doc.text(String(v), cX + cW - PAD.right + 1.5, gy + 1.2);
      });
      doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...RED_RGB);
      doc.text("RPE", cX + cW - PAD.right + 1.5, cY + PAD.top - 1);

      tlSessions.forEach((s, i) => {
        if (s.interno === null) return;
        const bh = (s.interno / maxTL) * plotH;
        const bx = bX(i) - barW / 2, by = cY + PAD.top + plotH - bh;
        const r = Math.min(1.0, barW / 2, bh / 2);
        doc.setFillColor(55, 65, 81); doc.setDrawColor(37, 47, 63); doc.setLineWidth(0.15);
        doc.roundedRect(bx, by, barW, bh, r, r, "FD");
      });

      doc.setDrawColor(...RED_RGB); doc.setLineWidth(0.6); doc.setLineDashPattern([], 0);
      const rpePts = tlSessions.map((s, i) => s.rpe !== null ? { i, v: s.rpe } : null).filter((p): p is { i: number; v: number } => p !== null);
      if (rpePts.length >= 2) {
        const tension = 0.25;
        const rx = (k: number) => bX(rpePts[Math.max(0, Math.min(rpePts.length - 1, k))].i);
        const ry = (k: number) => rpeY(rpePts[Math.max(0, Math.min(rpePts.length - 1, k))].v);
        doc.moveTo(rx(0), ry(0));
        for (let k = 0; k < rpePts.length - 1; k++) {
          doc.curveTo(rx(k) + (rx(k+1) - rx(k-1)) * tension, ry(k) + (ry(k+1) - ry(k-1)) * tension,
            rx(k+1) - (rx(k+2) - rx(k)) * tension, ry(k+1) - (ry(k+2) - ry(k)) * tension, rx(k+1), ry(k+1));
        }
        doc.stroke();
      }
      tlSessions.forEach((s, i) => {
        if (s.rpe === null) return;
        doc.setFillColor(...RED_RGB); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.35);
        doc.circle(bX(i), rpeY(s.rpe), 0.8, "FD");
        const barTopP = s.interno !== null ? cY + PAD.top + (1 - s.interno / maxTL) * plotH : cY + PAD.top;
        const insideBarP = rpeY(s.rpe) - 2 >= barTopP;
        doc.setFontSize(4.5); doc.setFont("helvetica", "bold");
        doc.setTextColor(...(insideBarP ? ([255, 255, 255] as [number, number, number]) : RED_RGB));
        doc.text(s.rpe.toFixed(1), bX(i), rpeY(s.rpe) - 2, { align: "center" });
      });

      const lblStep = n <= 20 ? 1 : Math.ceil(n / 20);
      tlSessions.forEach((s, i) => {
        if (i % lblStep !== 0) return;
        doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 120, 120);
        doc.text(s.dateLabel || s.data, bX(i), cY + cH - 1, { align: "center" });
      });

      const legY = cY + cH - 5, legX = cX + PAD.left;
      doc.setFillColor(55, 65, 81); doc.setDrawColor(37, 47, 63); doc.setLineWidth(0.15);
      doc.roundedRect(legX, legY - 2.5, 4, 2.5, 0.6, 0.6, "FD");
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      doc.text("Training Load (UA)", legX + 5.5, legY);
      doc.setDrawColor(...RED_RGB); doc.setLineWidth(0.6); doc.setLineDashPattern([], 0);
      doc.line(legX + 46, legY - 1.2, legX + 50, legY - 1.2);
      doc.setFillColor(...RED_RGB); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.35);
      doc.circle(legX + 48, legY - 1.2, 0.7, "FD");
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      doc.text("RPE (scala 0-10)", legX + 51.5, legY);
      y = cY + cH + GAP_Y;
    }

    const chartMetrics = activeMetrics.filter((m) => m.key !== "rpe" && m.key !== "interno" && m.key !== "durata");
    for (let i = 0; i < chartMetrics.length; i += 2) {
      if (y + CHART_H > PH - M) { doc.addPage(); y = addHeader(true); }
      drawChart(chartMetrics[i], M, y, CHART_W, CHART_H);
      if (i + 1 < chartMetrics.length) drawChart(chartMetrics[i + 1], M + CHART_W + 6, y, CHART_W, CHART_H);
      y += CHART_H + GAP_Y;
    }

    if (testTableRows.length > 0) {
      doc.addPage();
      let ty = addHeader(true);
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK_RGB);
      doc.text("Test", M, ty + 2); ty += 7;
      const pdfSessions: { dateLabel: string; infortunio: string; tests: { nome: string; risultato: string }[] }[] = [];
      let lastSessionKey = "";
      testTableRows.forEach((r) => {
        const key = r.data + "||" + r.infortunio;
        if (key !== lastSessionKey) { lastSessionKey = key; pdfSessions.push({ dateLabel: r.dateLabel, infortunio: r.infortunio, tests: [] }); }
        pdfSessions[pdfSessions.length - 1].tests.push({ nome: r.nomeTest, risultato: r.risultato });
      });
      const groupedBody: any[] = [];
      pdfSessions.forEach((s) => {
        s.tests.forEach((t, i) => {
          if (i === 0) {
            groupedBody.push([
              { content: s.dateLabel, rowSpan: s.tests.length, styles: { valign: "middle" as const, halign: "center" as const } },
              { content: s.infortunio, rowSpan: s.tests.length, styles: { valign: "middle" as const } },
              t.nome, t.risultato,
            ]);
          } else { groupedBody.push([t.nome, t.risultato]); }
        });
      });
      autoTable(doc, {
        startY: ty,
        head: [["Data", "Infortunio", "Test", "Risultato"]],
        body: groupedBody,
        headStyles: { fillColor: DARK_RGB, textColor: 255, fontSize: 6.5, halign: "center", valign: "middle" },
        bodyStyles: { fontSize: 6.5, cellPadding: 1.8, overflow: "linebreak" as const, valign: "middle" as const },
        alternateRowStyles: { fillColor: [249, 249, 249] },
        margin: { left: M, right: M, top: 18 },
        columnStyles: { 0: { cellWidth: 18, halign: "center" as const }, 1: { cellWidth: 55 }, 2: { cellWidth: 80 }, 3: { cellWidth: "auto" as any } },
        didDrawPage: (() => { let first = true; return () => { if (first) first = false; else addHeader(true); }; })(),
      });
    }

    const pages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY_RGB);
      doc.text(`${p} / ${pages}`, PW - M, 205, { align: "right" });
    }
    doc.save(`performance_${nd(selectedAtleta!).replace(/ /g, "_")}.pdf`);
  }

  // ── Trend icon ───────────────────────────────────────────────────────────────
  function TrendIcon({ t }: { t: "up" | "down" | "flat" | "none" }) {
    if (t === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500 shrink-0" />;
    if (t === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    if (t === "flat") return <Minus className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
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

  const hasGps = sessions.length > 0;
  const hasTests = testTimelines.size > 0;
  const hasPalestra = !!gymStats;
  const hasAny = hasGps || hasTests || hasPalestra;

  const tabs = [
    { key: "gps" as const,      label: "GPS & Carico",  show: hasGps },
    { key: "test" as const,     label: "Test Fisici",   show: hasTests },
    { key: "palestra" as const, label: "Palestra",      show: hasPalestra },
  ].filter((t) => t.show);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f5f7]">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div
        className="bg-white border-b border-gray-200 px-4 md:px-6 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)", paddingBottom: "0.875rem" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Performance</h1>
            <p className="text-xs text-gray-400 mt-0.5">GPS · Test Fisici · Palestra</p>
          </div>
          <button
            onClick={exportPdf}
            disabled={!selectedAtleta || sessions.length === 0}
            className="flex items-center gap-1.5 border border-red-200 text-[#C8102E] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-40 transition-colors shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* ── Athlete selector ─────────────────────────────────────────────── */}
      {atletiConDati.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 shrink-0">
          <div className="flex items-center gap-2 max-w-sm">
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
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer"
            >
              <option value="">— Seleziona atleta —</option>
              {atletiConDati.map((a) => (
                <option key={a.id} value={a.id}>{nd(a)}{a.categoria ? ` — ${a.categoria}` : ""}</option>
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

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      {hasAny && selectedId && tabs.length > 1 && (
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 shrink-0">
          <div className="flex -mb-px">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === key
                    ? "border-[#C8102E] text-[#C8102E]"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-none px-4 md:px-6 py-5">

        {atletiConDati.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Activity className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">Nessun atleta infortunato con dati</p>
            <p className="text-gray-400 text-sm mt-1">La sezione Performance mostra solo gli atleti attualmente Infortunati o NTL</p>
          </div>
        )}

        {selectedId && !hasAny && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Activity className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">Nessun dato per questo atleta</p>
          </div>
        )}

        {/* ── GPS & Carico tab ─────────────────────────────────────────── */}
        {tab === "gps" && (
          <>
            {!hasGps && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <BarChart3 className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">Nessun dato GPS per questo atleta</p>
              </div>
            )}
            {hasGps && (
              <div className="space-y-4">

                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                  <div className="bg-white rounded-2xl border border-gray-200 p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sessioni</p>
                    <p className="text-3xl font-bold text-gray-900">{sessions.length}</p>
                    <p className="text-[10px] text-gray-400 mt-1">registrate</p>
                  </div>
                  {activeMetrics.map((m) => {
                    const t = trend(m.key);
                    return (
                      <div key={m.key} className="bg-white rounded-2xl border border-gray-200 p-4">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                          {m.shortLabel}{m.unit ? ` (${m.unit})` : ""}
                        </p>
                        <div className="flex items-end gap-1.5">
                          <span className="text-2xl font-bold text-gray-900">{lastVal(m.key, m.dec)}</span>
                          <TrendIcon t={t} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">media {avgVal(m.key, m.dec)}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Charts grouped by section */}
                <div className="space-y-5">
                  {GPS_GROUPS.map((grp) => {
                    const grpMetrics = grp.keys.map((k) => activeMetrics.find((m) => m.key === k)).filter(Boolean) as MetricDef[];
                    if (!grpMetrics.length) return null;
                    return (
                      <div key={grp.label}>
                        <div className="flex items-center gap-2 mb-3 px-0.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: grp.color }} />
                          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: grp.color }}>{grp.label}</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {grpMetrics.map((m) => {
                            const t = trend(m.key);
                            const isExpanded = expandedKey === m.key;
                            return (
                              <div
                                key={m.key}
                                className={`bg-white rounded-2xl border border-gray-200 p-4 cursor-pointer transition-all hover:border-gray-300 ${isExpanded ? "lg:col-span-2" : ""}`}
                                onClick={() => setExpandedKey(isExpanded ? null : m.key)}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: grp.color }} />
                                    <span className="font-semibold text-gray-800 text-sm">{m.label}</span>
                                    {m.unit && (
                                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{m.unit}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs">
                                    <span className="text-gray-400">Ult. <span className="font-bold text-gray-800">{lastVal(m.key, m.dec)}</span></span>
                                    <TrendIcon t={t} />
                                    <span className="text-gray-300">|</span>
                                    <span className="text-gray-400">Med. <span className="font-semibold text-gray-700">{avgVal(m.key, m.dec)}</span></span>
                                    <span className="text-gray-300">|</span>
                                    <span className="text-gray-400">Max <span className="font-semibold text-gray-700">{maxVal(m.key, m.dec)}</span></span>
                                  </div>
                                </div>
                                <MetricChart sessions={sessions} metric={{ ...m, color: grp.color }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Collapsible data table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedKey(expandedKey === "__gps_table__" ? null : "__gps_table__")}
                  >
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tabella storico sessioni</p>
                    {expandedKey === "__gps_table__" ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expandedKey === "__gps_table__" && (
                    <div className="border-t border-gray-100 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            {["Data", "Programma", "Fase"].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                            ))}
                            {activeMetrics.map((m) => (
                              <th key={m.key} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                                {m.shortLabel}{m.unit && <span className="font-normal lowercase text-gray-400"> {m.unit}</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...sessions].reverse().map((s, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                              <td className="px-4 py-2 text-xs font-mono text-gray-500 whitespace-nowrap">
                                {s.data ? new Date(s.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-700 max-w-[140px] truncate">{s.nome || "—"}</td>
                              <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{s.fase || "—"}</td>
                              {activeMetrics.map((m) => {
                                const v = s[m.key] as number | null;
                                return (
                                  <td key={m.key} className="px-3 py-2 text-center whitespace-nowrap">
                                    {v != null ? <span className="font-mono text-xs text-gray-800">{fv(v, m.dec)}</span> : <span className="text-gray-300 text-xs">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 bg-gray-50">
                            <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Media</td>
                            {activeMetrics.map((m) => (
                              <td key={m.key} className="px-3 py-2 text-center text-xs font-semibold text-gray-600">{avgVal(m.key, m.dec)}</td>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Test Fisici tab ───────────────────────────────────────────── */}
        {tab === "test" && (
          <>
            {!hasTests && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Activity className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">Nessun test registrato per questo atleta</p>
              </div>
            )}
            {hasTests && (
              <div className="space-y-5">
                {(() => {
                  const allEntries = Array.from(testTimelines.entries());
                  const categorized = new Set<string>();
                  const renderTestCard = (nome: string, tl: typeof testTimelines extends Map<string, infer V> ? V : never, catColor?: string) => {
                    const accentColor = catColor ?? tl.color;
                    const t = testTrend(tl);
                    const lastPt = tl.points[tl.points.length - 1];
                    const isExpanded = expandedTestKey === nome;
                    const asymPct =
                      tl.isBilateral && nome !== "QSLS" &&
                      lastPt?.sx != null && lastPt?.dx != null &&
                      Math.max(lastPt.sx, lastPt.dx) > 0
                        ? ((Math.abs(lastPt.sx - lastPt.dx) / Math.max(lastPt.sx, lastPt.dx)) * 100).toFixed(1)
                        : null;
                    return (
                    <div key={nome} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      {/* Row — always visible, click to expand */}
                      <div
                        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50/60 transition-colors select-none"
                        onClick={() => setExpandedTestKey(isExpanded ? null : nome)}
                      >
                        {/* Color accent bar */}
                        <div className="w-[3px] self-stretch rounded-full shrink-0" style={{ background: accentColor }} />

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{nome}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {tl.points.length} {tl.points.length === 1 ? "rilevazione" : "rilevazioni"} · ultima: {lastPt?.dateLabel ?? "—"}
                          </p>
                        </div>

                        {/* Latest value */}
                        {tl.isBilateral ? (
                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-2 justify-end">
                              {lastPt?.sx != null && <span className="text-sm font-bold text-blue-600">Sx {lastPt.sx}</span>}
                              {lastPt?.dx != null && <span className="text-sm font-bold text-red-500">Dx {lastPt.dx}</span>}
                              {tl.unit && <span className="text-[10px] text-gray-400">{tl.unit}</span>}
                              <TrendIcon t={t} />
                            </div>
                            {asymPct && (
                              <p className="text-[10px] font-semibold text-orange-500 text-right mt-0.5">Δ {asymPct}%</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-lg font-bold" style={{ color: accentColor }}>{lastTestVal(tl, nome)}</span>
                            <TrendIcon t={t} />
                          </div>
                        )}

                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                          {/* Mini chart */}
                          {tl.points.length >= 2 && (
                            <div className="mb-4 -mx-1">
                              <TestLineChart points={tl.points} color={accentColor} isBilateral={tl.isBilateral} unit={tl.unit} />
                            </div>
                          )}

                          {/* History table */}
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left pb-2 pr-4 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Data</th>
                                  {tl.isBilateral ? (
                                    <>
                                      <th className="text-center pb-2 px-3 text-[10px] font-semibold text-blue-400 uppercase tracking-wide whitespace-nowrap">
                                        Sx {tl.unit ? `(${tl.unit})` : ""}
                                      </th>
                                      <th className="text-center pb-2 px-3 text-[10px] font-semibold text-red-400 uppercase tracking-wide whitespace-nowrap">
                                        Dx {tl.unit ? `(${tl.unit})` : ""}
                                      </th>
                                      <th className="text-center pb-2 px-3 text-[10px] font-semibold text-orange-400 uppercase tracking-wide whitespace-nowrap">Δ Asim.</th>
                                    </>
                                  ) : (
                                    <th className="text-center pb-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                                      Valore {tl.unit ? `(${tl.unit})` : ""}
                                    </th>
                                  )}
                                  <th className="text-center pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Trend</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...tl.points].reverse().map((pt, i, arr) => {
                                  const prevPt = arr[i + 1];
                                  const rowTrend = calcPointTrend(pt, prevPt, tl.isBilateral);
                                  return (
                                    <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50/60"}>
                                      <td className="py-2 pr-4 text-xs font-mono text-gray-500 whitespace-nowrap">{pt.dateLabel || pt.data}</td>
                                      {tl.isBilateral ? (
                                        <>
                                          <td className="py-2 px-3 text-center text-xs font-bold text-blue-700">
                                            {pt.sx != null ? pt.sx : <span className="text-gray-300 font-normal">—</span>}
                                          </td>
                                          <td className="py-2 px-3 text-center text-xs font-bold text-red-600">
                                            {pt.dx != null ? pt.dx : <span className="text-gray-300 font-normal">—</span>}
                                          </td>
                                          <td className="py-2 px-3 text-center text-xs font-medium text-orange-500">
                                            {pt.sx != null && pt.dx != null && Math.max(pt.sx, pt.dx) > 0
                                              ? `${((Math.abs(pt.sx - pt.dx) / Math.max(pt.sx, pt.dx)) * 100).toFixed(1)}%`
                                              : <span className="text-gray-300">—</span>}
                                          </td>
                                        </>
                                      ) : (
                                        <td className="py-2 px-3 text-center text-xs font-bold text-gray-800">
                                          {nome === "Drop Jump" ? (
                                            <span>
                                              {pt.single != null ? `RSI ${pt.single}` : ""}
                                              {pt.altezza != null ? ` · Alt ${pt.altezza}cm` : ""}
                                            </span>
                                          ) : (
                                            pt.single != null ? pt.single : <span className="text-gray-300 font-normal">—</span>
                                          )}
                                        </td>
                                      )}
                                      <td className="py-2 text-center">
                                        <div className="flex justify-center">
                                          <TrendIcon t={rowTrend} />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Summary stats */}
                          <div className="flex gap-5 mt-3 pt-3 border-t border-gray-100">
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Media</p>
                              <p className="text-sm font-semibold text-gray-700 mt-0.5">{avgTestVal(tl, nome)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Rilevazioni</p>
                              <p className="text-sm font-semibold text-gray-700 mt-0.5">{tl.points.length}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  };
                  return (
                    <>
                      {TEST_CATEGORIES.map((cat) => {
                        const catEntries = allEntries.filter(([n]) => cat.keys.includes(n));
                        if (!catEntries.length) return null;
                        catEntries.forEach(([n]) => categorized.add(n));
                        return (
                          <div key={cat.label}>
                            <div className="flex items-center gap-2 mb-2 px-0.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: cat.color }}>{cat.label}</p>
                            </div>
                            <div className="space-y-3">
                              {catEntries.map(([nome, tl]) => renderTestCard(nome, tl, cat.color))}
                            </div>
                          </div>
                        );
                      })}
                      {/* Uncategorized tests */}
                      {allEntries.filter(([n]) => !categorized.has(n)).length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-0.5">Altri Test</p>
                          <div className="space-y-3">
                            {allEntries.filter(([n]) => !categorized.has(n)).map(([nome, tl]) => renderTestCard(nome, tl))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ── Palestra tab ─────────────────────────────────────────────── */}
        {tab === "palestra" && (
          <>
            {!hasPalestra && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Dumbbell className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">Nessuna sessione in palestra registrata</p>
              </div>
            )}
            {hasPalestra && gymStats && (
              <div className="space-y-4">

                {/* KPI strip */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl border border-gray-200 p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Tonnellaggio (7gg)</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {gymStats.tonnSettimana > 0
                        ? `${Math.round(gymStats.tonnSettimana).toLocaleString("it-IT")} kg`
                        : "—"}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">somma kg sollevati</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Volume (7gg)</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {gymStats.volSettimana > 0 ? gymStats.volSettimana.toLocaleString("it-IT") : "—"}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">serie × reps</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sessioni palestra</p>
                    <p className="text-2xl font-bold text-gray-900">{gymStats.sessioni.length}</p>
                    <p className="text-[10px] text-gray-400 mt-1">totali</p>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Donut — muscle group distribution */}
                  {gymStats.sliceGruppi.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Distribuzione Muscolare</p>
                      <div className="flex items-center gap-5">
                        <svg viewBox="0 0 120 120" className="w-36 h-36 shrink-0">
                          {(() => {
                            const R = 46, r = 28, cx = 60, cy = 60;
                            let sa = -Math.PI / 2;
                            const dc = ["#94a3b8", "#cbd5e1", "#e2e8f0"];
                            return gymStats.sliceGruppi.map((sl, didx) => {
                              const angle = (sl.pct / 100) * 2 * Math.PI;
                              const ea = sa + angle;
                              const x1 = cx + R * Math.cos(sa), y1 = cy + R * Math.sin(sa);
                              const x2 = cx + R * Math.cos(ea), y2 = cy + R * Math.sin(ea);
                              const xi1 = cx + r * Math.cos(sa), yi1 = cy + r * Math.sin(sa);
                              const xi2 = cx + r * Math.cos(ea), yi2 = cy + r * Math.sin(ea);
                              const lg = angle > Math.PI ? 1 : 0;
                              const d = `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${lg} 0 ${xi1} ${yi1} Z`;
                              const fill = MUSCLE_COLORS[sl.gruppo] ?? dc[didx % dc.length];
                              sa = ea;
                              return <path key={sl.gruppo} d={d} fill={fill} stroke="white" strokeWidth="1.5" />;
                            });
                          })()}
                        </svg>
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          {gymStats.sliceGruppi.map((sl) => (
                            <div key={sl.gruppo} className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: MUSCLE_COLORS[sl.gruppo] ?? "#94a3b8" }} />
                              <span className="text-xs text-gray-600 flex-1 truncate">{sl.gruppo}</span>
                              <span className="text-xs font-bold text-gray-800 shrink-0">{sl.pct}%</span>
                              <span className="text-[10px] text-gray-400 shrink-0 w-8 text-right">{sl.serie}s</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tonnage bar chart */}
                  {gymStats.sessioni.some((s) => s.tonnaggio > 0) && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Tonnellaggio per Sessione</p>
                      {(() => {
                        const dati = gymStats.sessioni.filter((s) => s.tonnaggio > 0).slice(-20);
                        const maxT = Math.max(...dati.map((s) => s.tonnaggio));
                        const W = 320, H = 120, PAD = { left: 42, right: 8, top: 8, bottom: 28 };
                        const bw = Math.max(4, (W - PAD.left - PAD.right) / dati.length - 2);
                        const step = dati.length <= 10 ? 1 : dati.length <= 16 ? 2 : 3;
                        return (
                          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }} preserveAspectRatio="none">
                            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                              const y = PAD.top + t * (H - PAD.top - PAD.bottom);
                              const lbl = Math.round(maxT * (1 - t));
                              return (
                                <g key={i}>
                                  <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth="0.8" />
                                  <text x={PAD.left - 3} y={y + 3.5} textAnchor="end" fontSize="8" fill="#9ca3af">
                                    {lbl > 0 ? (lbl >= 1000 ? `${(lbl / 1000).toFixed(1)}k` : String(lbl)) : ""}
                                  </text>
                                </g>
                              );
                            })}
                            {dati.map((s, i) => {
                              const plotW = W - PAD.left - PAD.right;
                              const x = PAD.left + (i + 0.5) * (plotW / dati.length);
                              const barH = maxT > 0 ? (s.tonnaggio / maxT) * (H - PAD.top - PAD.bottom) : 0;
                              const y = H - PAD.bottom - barH;
                              return (
                                <g key={i}>
                                  <rect x={x - bw / 2} y={y} width={bw} height={barH} fill="#C8102E" opacity="0.82" rx="2" />
                                  {i % step === 0 && (
                                    <text x={x} y={H - PAD.bottom + 11} textAnchor="middle" fontSize="7.5" fill="#9ca3af">{s.dateLabel}</text>
                                  )}
                                </g>
                              );
                            })}
                          </svg>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Session detail table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Storico sessioni palestra</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {["Data", "Programma", "Volume (s×r)", "Tonnellaggio (kg)"].map((h) => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...gymStats.sessioni].reverse().slice(0, 20).map((s, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                            <td className="px-4 py-2.5 text-xs font-mono text-gray-500 whitespace-nowrap">
                              {s.data ? new Date(s.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-700 max-w-[180px] truncate">{s.nome || "—"}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-gray-700 text-right">{s.volume > 0 ? s.volume.toLocaleString("it-IT") : "—"}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-gray-700 text-right">{s.tonnaggio > 0 ? Math.round(s.tonnaggio).toLocaleString("it-IT") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Totale</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-right text-gray-700">
                            {gymStats.sessioni.reduce((a, s) => a + s.volume, 0).toLocaleString("it-IT")}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-right text-gray-700">
                            {Math.round(gymStats.sessioni.reduce((a, s) => a + s.tonnaggio, 0)).toLocaleString("it-IT")}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
