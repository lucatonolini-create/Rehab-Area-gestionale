"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search, User, ChevronRight, Phone, Mail, Trash2, AlertTriangle, CheckCircle2, Clock, Pencil, RotateCcw, FileDown, X, ExternalLink, Copy, Check } from "lucide-react";
import {
  loadAtleti, loadProgrammi, upsertAtleta, upsertProgramma, deleteAtleta, uid, nd,
  subscribeToAtleti, subscribeToProgrammi, subscribeToIntakeInsert,
  CATEGORIE, TIPI_INFORTUNIO, EVENTI_INFORTUNIO, MECCANISMI_INFORTUNIO, CONTATTI_INFORTUNIO,
  LATI_INFORTUNIO, POSIZIONI_INFORTUNIO, TIPI_REFERTO, ESITI_REFERTO,
  calcolaProgressoAuto,
  loadDettaglioSituazionale, loadAllDettagliSituazionali, upsertDettaglioSituazionale, formToDettaglio, dettaglioToForm,
  patchRefertiClinici,
  type Atleta, type Stato, type InfortunioStorico, type Programma, type QuestionarioKinesiofobia,
  type TestFisiometrico, type RefertoClinico, type TipoReferto, type EsitoReferto,
  type DettaglioSituazionaleData, type DettaglioSituazionaleForm,
} from "@/lib/store";
import AtletaModal from "@/components/AtletaModal";
import OsiicsCombobox from "@/components/OsiicsCombobox";
import DettaglioSituazionale, { type DettaglioSituazionaleHandle } from "@/components/DettaglioSituazionale";
import type { OsiicsCode } from "@/lib/store";

const MAPPING_KEY = "perf_athlete_mapping";
function getPerfId(rehabId: string): string | null {
  try { return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? "{}")[rehabId] ?? null; } catch { return null; }
}

async function syncInjury(atleta: Atleta) {
  const perfId = getPerfId(atleta.id);
  const statoMap: Record<string, string> = { Infortunato: "rehab", NTL: "ntl", Disponibile: "disponibile" };
  const body: Record<string, any> = {
    external_id: atleta.id,
    athlete_name: atleta.nome,
    date: atleta.inizioRehab || new Date().toISOString().slice(0, 10),
    type: (atleta.tipoInfortunio ?? "").toLowerCase() || "altro",
    body_part: atleta.infortunio || "",
    status: statoMap[atleta.stato] ?? "rehab",
    notes: atleta.note || "",
  };
  if (perfId) body.athlete_id = perfId;
  if (atleta.fineRehab) body.expected_return = atleta.fineRehab;
  try {
    await fetch("/api/performance/injuries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { /* sync is best-effort */ }
}

async function getLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch("/logo.png");
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function _calcolaAsimmetria(sx: string, dx: string): number | null {
  const a = parseFloat(sx), b = parseFloat(dx);
  if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) return null;
  return Math.abs(a - b) / Math.max(a, b) * 100;
}
function _superioreTest(sx: string, dx: string): "Dx" | "Sx" | null {
  const a = parseFloat(sx), b = parseFloat(dx);
  if (isNaN(a) || isNaN(b) || a === b) return null;
  return b > a ? "Dx" : "Sx";
}
function _trovaPrecedenteTest(lista: Programma[], currentId: string, nomeTest: string): TestFisiometrico | null {
  const sorted = [...lista].filter(p => !p.assente && !p.riposo && p.tests?.length).sort((a, b) => a.data.localeCompare(b.data));
  const idx = sorted.findIndex(p => p.id === currentId);
  if (idx <= 0) return null;
  for (let k = idx - 1; k >= 0; k--) {
    const found = (sorted[k].tests ?? []).find(tt => tt.nome === nomeTest);
    if (found) return found;
  }
  return null;
}
function _calcolaDelta(curr: TestFisiometrico, prev: TestFisiometrico | null): number | null {
  if (!prev) return null;
  const avg = (vals: (string | undefined)[]) => { const ns = vals.map(v => parseFloat(v ?? "")).filter(v => !isNaN(v) && v > 0); return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : NaN; };
  if (curr.rsiSx || curr.rsiDx) { const c = avg([curr.rsiSx, curr.rsiDx]), p = avg([prev.rsiSx, prev.rsiDx]); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  if (curr.rsi && prev.rsi) { const c = parseFloat(curr.rsi), p = parseFloat(prev.rsi); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  if (curr.risultatoSx || curr.risultatoDx) { const c = avg([curr.risultatoSx, curr.risultatoDx]), p = avg([prev.risultatoSx, prev.risultatoDx]); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  if (curr.risultato && prev.risultato) { const c = parseFloat(curr.risultato), p = parseFloat(prev.risultato); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  return null;
}

function csvDownload(rows: string[][], filename: string) {
  const content = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function esportaStoricoCompletoCSV(atleta: Atleta, programmi: Programma[]) {
  const fmt = (d?: string | null) => d ? new Date(d + "T12:00").toLocaleDateString("it-IT") : "—";
  const rows: string[][] = [];

  rows.push(["DATI PERSONALI"]);
  rows.push(["Nome", nd(atleta)]);
  rows.push(["Categoria", atleta.categoria ?? "—"]);
  rows.push(["Ruolo", atleta.posizione ?? "—"]);
  rows.push(["Stato", atleta.stato ?? "—"]);
  rows.push(["Inizio riabilitazione", fmt(atleta.inizioRehab)]);
  rows.push(["Fine riabilitazione", fmt(atleta.fineRehab)]);
  if (atleta.osiicsCodice) rows.push(["Codice OSIICS", `${atleta.osiicsCodice}${atleta.osiicsDescrizione ? ` – ${atleta.osiicsDescrizione}` : ""}`]);
  if (atleta.note) rows.push(["Note", atleta.note]);
  rows.push([]);

  const storico = atleta.storicoInfortuni ?? [];
  if (storico.length > 0) {
    rows.push(["STORICO INFORTUNI"]);
    rows.push(["Diagnosi", "Tipo", "Inizio Rehab", "Fine Rehab", "Giorni persi", "Note"]);
    for (const inf of storico) {
      const gg = inf.inizioRehab && inf.fineRehab ? String(Math.max(0, Math.round((new Date(inf.fineRehab).getTime() - new Date(inf.inizioRehab).getTime()) / 864e5))) : "—";
      rows.push([inf.diagnosi ?? "—", inf.tipo ?? "—", fmt(inf.inizioRehab), fmt(inf.fineRehab), gg, inf.note ?? ""]);
    }
    rows.push([]);
  }

  const sessioni = programmi.filter(p => !p.riposo && !p.squadra);
  if (sessioni.length > 0) {
    rows.push(["SESSIONI DI LAVORO"]);
    rows.push(["Data", "Programma", "Fase", "Tipo", "#", "Esercizio/Descrizione", "Serie", "Reps/Durata", "Carico", "RIR", "VAS", "Note"]);
    for (const prog of sessioni) {
      const dataProg = prog.data ? fmt(prog.data) : "—";
      if (prog.assente) {
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Assente", "", prog.noteAssenza ?? "", "", "", "", "", "", ""]);
        continue;
      }
      (prog.esercizi ?? []).forEach((e, i) => {
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Palestra", String(i + 1), e.nome, e.serie ?? "—", e.reps || e.durata || "—", e.carico ?? "—", e.rir ?? "—", e.vas ? `${e.vas}/10` : "—", e.note ?? ""]);
      });
      (prog.esercizicampo ?? []).forEach((c, i) => {
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Campo", String(i + 1), (c as any).descrizione ?? (c as any).tipo ?? "—", (c as any).serie ?? "—", (c as any).durata ?? "—", "", "", (c as any).vas ? `${(c as any).vas}/10` : "—", ""]);
      });
      (prog.tests ?? []).forEach((t, i) => {
        const val = [t.risultato, t.risultatoSx ? `Sx ${t.risultatoSx}` : "", t.risultatoDx ? `Dx ${t.risultatoDx}` : ""].filter(Boolean).join(" / ");
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Test", String(i + 1), t.nome, "", val || "—", "", "", "", t.note ?? ""]);
      });
      const ca = prog.carico;
      if (ca && Object.values(ca).some(v => v)) {
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Carico", "", `RPE: ${ca.rpe || "—"}`, "", ca.durata || "—", "", "", "", `Dist.: ${ca.distanzaTotale || "—"}m  V.max: ${ca.velocitaMax || "—"}km/h  HSR: ${ca.hsr || "—"}m`]);
      }
    }
    rows.push([]);
  }

  const questionari = atleta.questionariKinesiofobia ?? [];
  if (questionari.length > 0) {
    rows.push(["VALUTAZIONE PSICOLOGICA TSK/AFAQ"]);
    rows.push(["Data", "Test", "Punteggio", "Max"]);
    for (const q of [...questionari].sort((a, b) => a.data.localeCompare(b.data))) {
      rows.push([fmt(q.data), q.tipoTest ?? "—", String(q.punteggio), q.tipoTest === "AFAQ" ? "42" : "40"]);
    }
  }

  csvDownload(rows, `${nd(atleta).replace(/ /g, "_")}_storico_completo.csv`);
}

async function esportaStoricoCompletoPDF(atleta: Atleta, programmi: Programma[], dettaglio?: import("@/lib/store").DettaglioSituazionaleData | null) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();
  const red: [number, number, number] = [200, 16, 46];
  const dark: [number, number, number] = [43, 43, 43];
  const gray: [number, number, number] = [130, 130, 130];
  const logoDataUrl = await getLogoDataUrl();
  const oggi = new Date().toLocaleDateString("it-IT");
  const M = 14; const W = 210; const H = 297; const HDR = 30;

  const addHeader = (subtitle?: string) => {
    doc.setFillColor(247, 247, 247); doc.rect(0, 0, W, HDR, "F");
    doc.setDrawColor(...red); doc.setLineWidth(0.4); doc.line(0, HDR, W, HDR);
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 4, 10, 10, 10);
    const tx = logoDataUrl ? 18 : M;
    doc.setTextColor(...red); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("U.S. Cremonese", tx, 15);
    doc.setFontSize(9); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(...gray);
    doc.text("Scheda Completa Atleta", tx, 19);
    if (subtitle) { doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray); doc.text(subtitle, tx, 24); }
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(175, 175, 175);
    doc.text("Stagione 2026-2027", W - M, 15, { align: "right" });
  };

  const secTitle = (text: string, y: number, fill?: [number, number, number]) => {
    const bg = fill ?? [245, 245, 245] as [number, number, number];
    const tc: [number, number, number] = fill ? [255, 255, 255] : dark;
    doc.setFillColor(...bg); doc.rect(M, y - 4, W - M * 2, 8, "F");
    if (!fill) { doc.setFillColor(...red); doc.rect(M, y - 4, 2.5, 8, "F"); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...tc);
    doc.text(text.toUpperCase(), M + 5, y + 0.8);
    return y + 11;
  };

  const addFooter = () => {
    const tot = doc.getNumberOfPages();
    for (let i = 1; i <= tot; i++) {
      doc.setPage(i);
      doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.3); doc.line(M, H - 12, W - M, H - 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...gray);
      doc.text("U.S. Cremonese · Rehab Area", M, H - 7);
      doc.text(`Pagina ${i} di ${tot}`, W - M, H - 7, { align: "right" });
    }
  };

  const fmtD = (d: string) => d ? new Date(d + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const ggPersi = (i: string, f: string) => { const ms = new Date(f).getTime() - new Date(i).getTime(); return Math.max(0, Math.round(ms / 864e5)); };

  let y = 0;
  const bS = { fontSize: 8.5, cellPadding: 3, overflow: "ellipsize" as const, halign: "left" as const, valign: "middle" as const };
  const aS = { fillColor: [250, 250, 250] as [number, number, number] };
  const hS = (fill: [number, number, number]) => ({ fillColor: fill, textColor: [255, 255, 255] as [number, number, number], fontSize: 7.5, halign: "center" as const, valign: "middle" as const });
  const checkPage = (need: number, sub?: string) => { if (y + need > H - 18) { doc.addPage(); addHeader(sub); y = HDR + 8; } };
  const miniLabel = (text: string) => { doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...gray); doc.text(text, M, y); y += 3; };
  const pn = (v: string | undefined): number | null => { const n = parseFloat(v ?? ""); return isNaN(n) ? null : n; };

  const drawChart = (items: { data: string; punteggio: number }[], sub?: string) => {
    if (items.length < 2) return;
    checkPage(68, sub);
    const sorted = [...items].sort((a, b) => a.data.localeCompare(b.data));
    const n = sorted.length;
    const yAxisW = 10; const cX = M + yAxisW; const cW = W - M - cX; const cH = 44; const cY = y + 7;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...dark);
    doc.text("Andamento RTS Score nel tempo", M, y + 2);
    doc.setFillColor(248, 248, 248); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.rect(cX, cY, cW, cH, "FD");
    ([
      [100, [210, 210, 210] as [number, number, number], false], [75, [34, 139, 34] as [number, number, number], true],
      [56, [210, 100, 0] as [number, number, number], true], [0, [210, 210, 210] as [number, number, number], false],
    ] as [number, [number, number, number], boolean][]).forEach(([val, col, dash]) => {
      const ly = cY + cH - (val / 100) * cH;
      doc.setDrawColor(...col); doc.setLineWidth(dash ? 0.45 : 0.2);
      if (dash) { let dx = cX; while (dx < cX + cW) { doc.line(dx, ly, Math.min(dx + 2.5, cX + cW), ly); dx += 4; } }
      else { doc.line(cX, ly, cX + cW, ly); }
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...col);
      doc.text(`${val}`, cX - 1.5, ly + 1.5, { align: "right" });
    });
    const padX = 10;
    const gX = (ii: number) => cX + padX + (n > 1 ? (ii / (n - 1)) * (cW - 2 * padX) : (cW - 2 * padX) / 2);
    const gY = (s: number) => cY + cH - (s / 100) * cH;
    doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.7);
    for (let ii = 0; ii < n - 1; ii++) doc.line(gX(ii), gY(sorted[ii].punteggio), gX(ii + 1), gY(sorted[ii + 1].punteggio));
    sorted.forEach((q, ii) => {
      const px = gX(ii); const py = gY(q.punteggio);
      const col: [number, number, number] = q.punteggio >= 75 ? [34, 139, 34] : q.punteggio >= 56 ? [234, 88, 12] : red;
      doc.setFillColor(...col); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5); doc.circle(px, py, 2, "FD");
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...col);
      doc.text(`${q.punteggio}`, px, q.punteggio > 90 ? py + 5 : py - 3.5, { align: "center" });
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
      doc.text(fmtD(q.data), px, cY + cH + 4.5, { align: "center" });
    });
    const legY = cY + cH + 10;
    ([{ col: [210, 100, 0] as [number, number, number], label: "Soglia moderata (56)" }, { col: [34, 139, 34] as [number, number, number], label: "Alta prontezza (75)" }])
      .forEach(({ col, label }, idx) => {
        const lx = M + idx * 72; doc.setDrawColor(...col); doc.setLineWidth(0.5);
        let dx = lx; while (dx < lx + 9) { doc.line(dx, legY, Math.min(dx + 2.5, lx + 9), legY); dx += 4; }
        doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray); doc.text(label, lx + 11, legY + 1);
      });
    y = legY + 10;
  };

  type CaricoSession = {
    dateLabel: string;
    dateFull: string;
    fase: string;
    rpe: number | null; interno: number | null; durata: number | null;
    distanza: number | null; hsr: number | null; vel21: number | null;
    vel25: number | null; velMax: number | null; acc: number | null;
    dec: number | null; sprint: number | null; potenza: number | null;
  };

  const drawPerfChart = (
    chartLabel: string,
    color: [number, number, number],
    data: { dateLabel: string; value: number }[],
    opts?: { startX?: number; width?: number; updateY?: boolean },
  ) => {
    if (data.length < 2) return;
    const [cr, cg, cb] = color;
    const cX = opts?.startX ?? M; const cW = opts?.width ?? (W - 2 * M); const cH = 42; const cY = y + 8;

    const GRID_C: [number, number, number] = [232, 234, 238];
    const AXIS_C: [number, number, number] = [140, 145, 155];
    const AVG_C: [number, number, number] = [185, 190, 200];

    const n = data.length;
    const vals = data.map((d) => d.value);
    const minV = Math.min(...vals); const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const avg = vals.reduce((a, b) => a + b, 0) / n;
    const fmtV = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1);

    const PAD = { top: 8, right: 5, bottom: 8, left: 18 };
    const plotX = cX + PAD.left; const plotW = cW - PAD.left - PAD.right;
    const plotY = cY + PAD.top; const plotH = cH - PAD.top - PAD.bottom;

    // White card with light border
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cX, cY, cW, cH, 1.5, 1.5, "F");
    doc.setDrawColor(225, 227, 232); doc.setLineWidth(0.25);
    doc.roundedRect(cX, cY, cW, cH, 1.5, 1.5, "S");

    // Colored left accent stripe
    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(cX, cY, 2, cH, 1, 1, "F");
    doc.setFillColor(255, 255, 255);
    doc.rect(cX + 1, cY, 1.5, cH, "F");

    // Title in metric color + stats top-right
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(cr, cg, cb);
    doc.text(chartLabel, cX + PAD.left, cY + 5.5);
    doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(...AXIS_C);
    doc.text(`Ult: ${fmtV(vals[n - 1])}  ·  Med: ${fmtV(avg)}  ·  Max: ${fmtV(maxV)}`, cX + cW - PAD.right, cY + 5.5, { align: "right" });

    // Grid + Y labels
    for (let t = 0; t <= 4; t++) {
      const tv = minV + (range / 4) * t;
      const ty = plotY + plotH - (t / 4) * plotH;
      doc.setDrawColor(...GRID_C); doc.setLineWidth(0.15);
      doc.line(plotX, ty, plotX + plotW, ty);
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...AXIS_C);
      doc.text(tv.toFixed(1), plotX - 1.5, ty + 1.5, { align: "right" });
    }

    const gX = (i: number) => plotX + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
    const gY = (v: number) => plotY + plotH - ((v - minV) / range) * plotH;

    // Catmull-Rom → Bezier control points for smooth curve
    const tension = 0.25;
    const smoothCp = (i: number) => {
      const xi = (k: number) => gX(Math.max(0, Math.min(n - 1, k)));
      const yi = (k: number) => gY(data[Math.max(0, Math.min(n - 1, k))].value);
      return {
        cp1x: xi(i)     + (xi(i + 1) - xi(i - 1)) * tension,
        cp1y: yi(i)     + (yi(i + 1) - yi(i - 1)) * tension,
        cp2x: xi(i + 1) - (xi(i + 2) - xi(i))     * tension,
        cp2y: yi(i + 1) - (yi(i + 2) - yi(i))     * tension,
      };
    };

    // Area fill (light tint, smooth curve)
    const ar = Math.round(cr * 0.10 + 255 * 0.90);
    const ag = Math.round(cg * 0.10 + 255 * 0.90);
    const ab = Math.round(cb * 0.10 + 255 * 0.90);
    const botY2 = plotY + plotH;
    doc.setFillColor(ar, ag, ab);
    doc.moveTo(gX(0), botY2);
    doc.lineTo(gX(0), gY(data[0].value));
    for (let i = 0; i < n - 1; i++) {
      const { cp1x, cp1y, cp2x, cp2y } = smoothCp(i);
      doc.curveTo(cp1x, cp1y, cp2x, cp2y, gX(i + 1), gY(data[i + 1].value));
    }
    doc.lineTo(gX(n - 1), botY2);
    doc.fill();

    // Average dashed line (light gray)
    doc.setDrawColor(...AVG_C); doc.setLineWidth(0.4); doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(plotX, gY(avg), plotX + plotW, gY(avg));
    doc.setLineDashPattern([], 0);

    // Main smooth line
    doc.setDrawColor(cr, cg, cb); doc.setLineWidth(0.85);
    doc.moveTo(gX(0), gY(data[0].value));
    for (let i = 0; i < n - 1; i++) {
      const { cp1x, cp1y, cp2x, cp2y } = smoothCp(i);
      doc.curveTo(cp1x, cp1y, cp2x, cp2y, gX(i + 1), gY(data[i + 1].value));
    }
    doc.stroke();

    // Dots (colored fill, white border)
    doc.setFillColor(cr, cg, cb); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.35);
    data.forEach((d, i) => doc.circle(gX(i), gY(d.value), 0.85, "FD"));

    // X-axis labels
    doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...AXIS_C);
    const step = n <= 12 ? 1 : n <= 24 ? 2 : Math.ceil(n / 12);
    data.forEach((d, i) => { if (i % step === 0) doc.text(d.dateLabel, gX(i), cY + cH + 4, { align: "center" }); });

    if (opts?.updateY !== false) y = cY + cH + 9;
  };

  const getMonday = (dateStr: string): string => {
    const d = new Date(dateStr + "T12:00");
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d); mon.setDate(diff);
    return mon.toISOString().slice(0, 10);
  };

  const renderWeeklyTable = (progs: Programma[], sub?: string) => {
    const weekMap: Map<string, Programma[]> = new Map();
    for (const prog of progs) {
      const wk = prog.data ? getMonday(prog.data) : "__nodata__";
      if (!weekMap.has(wk)) weekMap.set(wk, []);
      weekMap.get(wk)!.push(prog);
    }

    const MIN_WEEK_SPACE = 45;
    let isFirstWeek = true;

    Array.from(weekMap.entries()).forEach(([wk, wkProgs]) => {
      let weekLabel: string;
      if (wk === "__nodata__") {
        weekLabel = "SESSIONI SENZA DATA";
      } else {
        const mon = new Date(wk + "T12:00");
        const sun = new Date(mon.getTime() + 6 * 864e5);
        weekLabel = `SETTIMANA  ${mon.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} – ${sun.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
      }

      let weekStartY: number;
      if (isFirstWeek) {
        checkPage(30, sub);
        weekStartY = y;
      } else {
        const prevY = (doc as any).lastAutoTable?.finalY ?? y;
        if (H - M - prevY < MIN_WEEK_SPACE) {
          doc.addPage();
          addHeader(sub);
          weekStartY = HDR + 8;
        } else {
          weekStartY = prevY + 4;
        }
      }
      isFirstWeek = false;

      const body: any[] = [];
      const weekRowIndices = new Set<number>();
      const subHeaderRowIndices = new Set<number>();
      const altRowIndices = new Set<number>();
      const absenteRowIndices = new Set<number>();
      const riposoRowIndices = new Set<number>();
      const squadraRowIndices = new Set<number>();

      weekRowIndices.add(body.length);
      body.push([{ content: weekLabel, colSpan: 12 }]);
      subHeaderRowIndices.add(body.length);
      body.push(["Data", "Programma", "Fase", "Fisio", "Obiettivi\nPalestra", "Esercizi\nPalestra", "VAS", "Obiettivi\nCampo", "Esercizi\nCampo", "VAS\nCampo", "GPS", "RPE"]);

      let dataRowCount = 0;
      for (const prog of wkProgs) {
        const isAlt = dataRowCount % 2 === 1;
        const dataStr = prog.data ? fmtD(prog.data) : "—";
        const esercizi = prog.esercizi ?? [];

        if (prog.assente) {
          absenteRowIndices.add(body.length);
          body.push([dataStr, prog.nome ?? "—", { content: "ASSENTE" + (prog.noteAssenza ? `\n${prog.noteAssenza}` : ""), colSpan: 10, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++;
          continue;
        }

        if (prog.riposo) {
          riposoRowIndices.add(body.length);
          body.push([dataStr, prog.nome ?? "—", { content: "RIPOSO" + (prog.noteAssenza ? `\n${prog.noteAssenza}` : ""), colSpan: 10, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++;
          continue;
        }

        if (prog.squadra) {
          squadraRowIndices.add(body.length);
          body.push([dataStr, prog.nome ?? "—", { content: "RITORNO IN SQUADRA" + (prog.noteAssenza ? `  ·  ${prog.noteAssenza}` : ""), colSpan: 10, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++;
          continue;
        }

        const obP = prog.obiettiviPalestra?.length ? prog.obiettiviPalestra.map(o => `- ${o.replace(/\//g, "/ ")}`).join("\n") : "—";
        const obCampo = prog.obiettiviCampo?.length ? prog.obiettiviCampo.map(o => `- ${o.replace(/\//g, "/ ")}`).join("\n") : "—";

        const esC = (prog.esercizicampo ?? []).map((c, i) => {
          const parts = [c.tipo, c.serie ? `${c.serie}×` : "", c.durata || ""].filter(Boolean);
          return `${i + 1}. ${parts.join(" ")}`;
        }).join("\n") || "—";
        const vasC = (() => { const items = (prog.esercizicampo ?? []).map((c, i) => ({ n: i + 1, v: (c as any).vas })).filter(x => x.v && x.v !== "0"); return items.length ? items.map(x => `${x.n}. ${x.v}`).join("\n") : "—"; })();

        const ca = prog.carico;
        const rpe = ca?.rpe ? `${ca.rpe}/10` : "—";
        const gps = [
          ca?.distanzaTotale ? `Dist.: ${ca.distanzaTotale}m` : "",
          ca?.velocitaMax ? `V.max: ${ca.velocitaMax}km/h` : "",
          ca?.hsr ? `D>16km/h: ${ca.hsr}m` : "",
          ca?.velocita21 ? `D>20km/h: ${ca.velocita21}m` : "",
          ca?.velocita25 ? `D>25km/h: ${ca.velocita25}m` : "",
          ca?.accelerazioni ? `N.Acc: ${ca.accelerazioni}` : "",
          ca?.decelerazioni ? `N.Dec: ${ca.decelerazioni}` : "",
          ca?.sprint ? `N.Spr: ${ca.sprint}` : "",
          ca?.potenzaMetabolica ? `P.Met.: ${ca.potenzaMetabolica}W/kg` : "",
        ].filter(Boolean).map((s) => `- ${s}`).join("\n") || "—";

        const esText = esercizi.map((e, i) => { let det = ""; if (e.serie && (e.reps || e.durata)) { det = `${e.serie}×${e.reps || e.durata}${e.reps && e.durata ? ` ${e.durata}` : ""}`; } else if (!e.serie && !e.reps && e.durata) { det = `×${e.durata}`; } else { det = [e.serie, e.reps, e.durata].filter(Boolean).join(" "); } const carico = e.carico ? ` (${e.carico})` : ""; return `${i + 1}. ${det ? `${e.nome} ${det}${carico}` : e.nome}`; }).join("\n") || "—";
        const vasText = (() => { const items = esercizi.map((e, i) => ({ n: i + 1, v: e.vas })).filter(x => x.v && x.v !== "0"); return items.length ? items.map(x => `${x.n}. ${x.v}`).join("\n") : "—"; })();
        const fisio = prog.noteFisioterapia?.trim() || "—";
        if (isAlt) altRowIndices.add(body.length);
        body.push([dataStr, prog.nome ?? "—", prog.fase ?? "—", fisio, obP, esText, vasText, obCampo, esC, vasC, gps, rpe]);
        dataRowCount++;
      }

      autoTable(doc, {
        startY: weekStartY,
        body,
        bodyStyles: { fontSize: 5.5, cellPadding: 1.5, overflow: "linebreak" as const, halign: "left" as const, valign: "middle" as const },
        margin: { left: M, right: M, top: HDR + 8 },
        columnStyles: {
          0:  { cellWidth: 15 },
          1:  { cellWidth: 20 },
          2:  { cellWidth: 9 },
          3:  { cellWidth: 18 },
          4:  { cellWidth: 18 },
          5:  { cellWidth: 18 },
          6:  { cellWidth: 7, halign: "center" as const },
          7:  { cellWidth: 18 },
          8:  { cellWidth: 18 },
          9:  { cellWidth: 10, halign: "center" as const },
          10: { cellWidth: 24 },
          11: { cellWidth: 7, halign: "center" as const },
        },
        didDrawPage: () => { addHeader(sub); },
        didParseCell: (data: any) => {
          if (data.section !== "body") return;
          if (weekRowIndices.has(data.row.index)) {
            data.cell.styles.fillColor = [200, 16, 46];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fontSize = 6.5;
            data.cell.styles.cellPadding = { top: 3, bottom: 3, left: 4, right: 2 };
          } else if (subHeaderRowIndices.has(data.row.index)) {
            data.cell.styles.fillColor = [110, 110, 110];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fontSize = 5.3;
            data.cell.styles.halign = "center";
            data.cell.styles.valign = "middle";
            data.cell.styles.cellPadding = { top: 2, bottom: 2, left: 1.5, right: 1 };
          } else if (absenteRowIndices.has(data.row.index)) {
            data.cell.styles.fillColor = [255, 237, 213];
            data.cell.styles.textColor = [154, 52, 18];
          } else if (riposoRowIndices.has(data.row.index)) {
            data.cell.styles.fillColor = [219, 234, 254];
            data.cell.styles.textColor = [30, 64, 175];
          } else if (squadraRowIndices.has(data.row.index)) {
            data.cell.styles.fillColor = [187, 247, 208];
            data.cell.styles.textColor = [22, 101, 52];
            data.cell.styles.fontStyle = "bold";
          } else if (altRowIndices.has(data.row.index)) {
            data.cell.styles.fillColor = [243, 244, 246];
          } else {
            data.cell.styles.fillColor = [255, 255, 255];
          }
        },
      });
    });

    y = (doc as any).lastAutoTable.finalY + 6;

  };

  // ── Pagina 1: dati atleta ──────────────────────────────────────────────────
  addHeader();
  doc.setTextColor(...dark); doc.setFontSize(17); doc.setFont("helvetica", "bold");
  doc.text(nd(atleta), M, HDR + 13);
  const info = [atleta.categoria, atleta.posizione, atleta.piedeDominante ? `Piede ${atleta.piedeDominante}` : ""].filter(Boolean).join("  ·  ");
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
  doc.text(info, M, HDR + 21);
  const badgeColor: [number, number, number] = atleta.stato === "Disponibile" ? [34, 139, 34] : atleta.stato === "NTL" ? [180, 120, 0] : red;
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
  const stateTextW = doc.getStringUnitWidth(atleta.stato) * 7.5 / doc.internal.scaleFactor;
  const badgeW = Math.max(stateTextW + 10, 36);
  const badgeX = W - M - badgeW;
  doc.setFillColor(...badgeColor); doc.roundedRect(badgeX, HDR + 7, badgeW, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(atleta.stato, badgeX + badgeW / 2, HDR + 13, { align: "center" });
  doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(M, HDR + 27, W - M, HDR + 27);

  y = HDR + 34;
  y = secTitle("Dati generali", y);
  autoTable(doc, {
    startY: y,
    body: [
      ["Categoria / Ruolo", `${atleta.categoria}  ·  ${atleta.posizione || "—"}`],
      ["Piede dominante", atleta.piedeDominante || "—"],
      ...(atleta.peso || atleta.altezza ? [["Peso / Altezza", `${atleta.peso || "—"} kg  ·  ${atleta.altezza || "—"} cm`]] : [] as any),
      ["Stato attuale", atleta.stato],
      ...(atleta.plicometrieMedie ? [["Plicometria media", `${atleta.plicometrieMedie} mm`]] : [] as any),
      ...(atleta.altezzaDaSeduto ? [["Altezza da seduto", `${atleta.altezzaDaSeduto} cm`]] : [] as any),
      ...(() => {
        if (!atleta.altezzaDaSeduto || !atleta.peso || !atleta.altezza || !atleta.dataNascita) return [] as any;
        const eta = (Date.now() - new Date(atleta.dataNascita + "T12:00").getTime()) / (365.25 * 24 * 3600 * 1000);
        if (eta <= 0 || eta > 20) return [] as any;
        const gambe = parseFloat(atleta.altezza) - parseFloat(atleta.altezzaDaSeduto);
        const sit = parseFloat(atleta.altezzaDaSeduto);
        const offset = -9.236 + 0.0002708*(gambe*sit) - 0.001663*(eta*gambe) + 0.007216*(eta*sit) + 0.02292*(parseFloat(atleta.peso)/parseFloat(atleta.altezza)*100);
        const etaPHV = eta - offset;
        return [["PHV (Mirwald)", `Età PHV stimata: ${etaPHV.toFixed(1)} anni  ·  Offset: ${offset >= 0 ? "+" : ""}${offset.toFixed(2)} anni`]] as any;
      })(),
    ],
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak", halign: "left", valign: "middle" },
    columnStyles: { 0: { cellWidth: 58, fontStyle: "bold", textColor: dark }, 1: { textColor: dark } },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: M, right: M, top: HDR + 8 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Referti Clinici ───────────────────────────────────────────────────────
  const referti = [...(atleta.refertiClinici ?? [])].sort((a, b) => b.data.localeCompare(a.data));
  if (referti.length > 0) {
    checkPage(20);
    y = secTitle("Referti Clinici", y);
    const esitoColor = (e: string): [number, number, number] => {
      if (e === "Positivo")        return [200, 16, 46];
      if (e === "In miglioramento") return [180, 83, 9];
      return [22, 101, 52]; // Negativo
    };
    autoTable(doc, {
      startY: y,
      head: [["Data", "Tipo", "Esito", "Note"]],
      body: referti.map((r) => [
        new Date(r.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }),
        r.tipo,
        r.esito,
        r.note ?? "—",
      ]),
      headStyles: { fillColor: [55, 65, 81] as [number,number,number], textColor: 255, fontSize: 7.5, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak", halign: "left", valign: "middle" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: M, right: M, top: HDR + 8 },
      columnStyles: {
        0: { cellWidth: 28, halign: "center" },
        1: { cellWidth: 44 },
        2: { cellWidth: 36, halign: "center", fontStyle: "bold" },
        3: { cellWidth: "auto" as any },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 2) {
          const clr = esitoColor(data.cell.raw as string);
          data.cell.styles.textColor = clr;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Storico infortuni (deduplicato per chiave diagnosi+inizio+fine) ────────
  const storico = (() => {
    const seen = new Set<string>();
    return (atleta.storicoInfortuni ?? []).filter((inf) => {
      const key = `${inf.diagnosi}|${inf.inizioRehab}|${inf.fineRehab ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  // Giorni persi = numero di sessioni inserite per quell'infortunio (non giorni di calendario)
  const isSessionePDF = (p: Programma) => !p.riposo;
  // Controlla se le parole del nome sessione compaiono nella diagnosi/tipo dell'infortunio
  const nomeMatchInj = (nome: string, diagnosi: string, tipo?: string) => {
    const words = (nome ?? "").toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    const target = `${diagnosi} ${tipo ?? ""}`.toLowerCase();
    return words.some(w => target.includes(w));
  };
  const matchesInfPDF = (p: Programma, inf: { id: string; diagnosi?: string; tipo?: string; inizioRehab: string; fineRehab: string }) => {
    if (p.infortunioId && p.infortunioId !== "__corrente__") return p.infortunioId === inf.id;
    if (p.infortunioId === "__corrente__") {
      if (inf.id === "__corrente__") return true;
      // Sessione orfana: mappa per data sull'infortunio archiviato
      if (!p.data || !inf.inizioRehab) return false;
      if (p.data < inf.inizioRehab) return false;
      if (inf.fineRehab && p.data > inf.fineRehab) return false;
      // Non assegnare sessioni successive all'inizio dell'infortunio corrente
      if ((atleta.stato === "Infortunato" || atleta.stato === "NTL") && atleta.inizioRehab && p.data >= atleta.inizioRehab) return false;
      return true;
    }
    // Nessun ID: match per nome sessione (priorità), poi per data
    if (inf.diagnosi && nomeMatchInj(p.nome ?? "", inf.diagnosi, inf.tipo)) return true;
    // Se il nome corrisponde a un altro storico, escludi da questo
    if (storico.some(s => s.id !== inf.id && nomeMatchInj(p.nome ?? "", s.diagnosi, s.tipo))) return false;
    if (!p.data || !inf.inizioRehab) return false;
    if (p.data < inf.inizioRehab) return false;
    if (inf.fineRehab && p.data > inf.fineRehab) return false;
    return true;
  };
  const sessStoricoMap = new Map(storico.map((inf) => [inf.id, programmi.filter((p) => matchesInfPDF(p, { id: inf.id, diagnosi: inf.diagnosi, tipo: inf.tipo, inizioRehab: inf.inizioRehab, fineRehab: inf.fineRehab }) && isSessionePDF(p)).length]));
  const giorniArchivio = storico.map((inf) => sessStoricoMap.get(inf.id) ?? 0);
  const squadraDateStorico = new Map(storico.map((inf) => {
    const first = programmi
      .filter((p) => matchesInfPDF(p, { id: inf.id, diagnosi: inf.diagnosi, tipo: inf.tipo, inizioRehab: inf.inizioRehab, fineRehab: inf.fineRehab }) && p.squadra)
      .sort((a, b) => a.data.localeCompare(b.data))[0];
    return [inf.id, first?.data ?? ""];
  }));
  // sessioni già attribuite agli infortuni concorrenti attivi (evita doppio conteggio nel totale)
  const concurrentSessIdsPDF = new Set(
    storico.filter((i) => i.attivo === true).flatMap((inf) =>
      programmi.filter((p) => matchesInfPDF(p, { id: inf.id, diagnosi: inf.diagnosi, tipo: inf.tipo, inizioRehab: inf.inizioRehab, fineRehab: inf.fineRehab }) && isSessionePDF(p)).map((p) => p.id)
    )
  );
  const giorniCorrente = (atleta.stato === "Infortunato" || atleta.stato === "NTL") && atleta.inizioRehab
    ? programmi.filter((p) => (
        (p.infortunioId === "__corrente__" && p.data >= atleta.inizioRehab) ||
        (!p.infortunioId && p.data >= atleta.inizioRehab && !concurrentSessIdsPDF.has(p.id))
      ) && isSessionePDF(p)).length : 0;
  const totaleStagionePDF = programmi.filter(isSessionePDF).length;

  y = secTitle("Storico infortuni", y);

  // Riquadro riepilogativo sessioni
  {
    const concorrentiPDF = (atleta.storicoInfortuni ?? []).filter((i) => i.attivo === true);
    const boxes: [string, string][] = [];
    if (atleta.stato === "Infortunato" || atleta.stato === "NTL") boxes.push(["Infortuni attivi", `${1 + concorrentiPDF.length}`]);
    boxes.push(["Totale stagione", `${totaleStagionePDF} sess.`]);
    const bw = (W - 2 * M - (boxes.length - 1) * 4) / boxes.length;
    boxes.forEach(([label, val], i) => {
      const bx = M + i * (bw + 4);
      doc.setFillColor(255, 247, 237); doc.roundedRect(bx, y, bw, 16, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(234, 88, 12);
      doc.text(label.toUpperCase(), bx + bw / 2, y + 5.5, { align: "center" });
      doc.setFontSize(11);
      doc.text(val, bx + bw / 2, y + 13, { align: "center" });
    });
    y += 22;
  }

  const storicoBody: any[] = [];
  // Infortunio corrente se in corso
  if ((atleta.stato === "Infortunato" || atleta.stato === "NTL") && (atleta.infortunio || atleta.inizioRehab)) {
    const squadraCorr = programmi
      .filter((p) => (p.infortunioId === "__corrente__" || !p.infortunioId) && p.squadra && (!atleta.inizioRehab || !p.data || p.data >= atleta.inizioRehab))
      .sort((a, b) => a.data.localeCompare(b.data))[0];
    storicoBody.push([`${atleta.infortunio || "—"}${atleta.tipoInfortunio ? ` (${atleta.tipoInfortunio})` : ""}`, fmtD(atleta.inizioRehab), "In corso", squadraCorr ? fmtD(squadraCorr.data) : "—", `${giorniCorrente} sess.`]);
  }
  // Infortuni archiviati (più recente prima)
  [...storico].reverse().forEach((inf, i) => {
    const realIdx = storico.length - 1 - i;
    const fineLabel = inf.attivo ? "In corso" : fmtD(inf.fineRehab);
    const squadraDate = squadraDateStorico.get(inf.id);
    storicoBody.push([`${inf.diagnosi}${inf.tipo ? ` (${inf.tipo})` : ""}`, fmtD(inf.inizioRehab), fineLabel, squadraDate ? fmtD(squadraDate) : "—", `${giorniArchivio[realIdx]} sess.`]);
  });

  if (storicoBody.length) {
    autoTable(doc, {
      startY: y,
      head: [["Diagnosi / Infortunio", "Inizio", "Fine", "Ritorno squadra", "Sessioni"]],
      body: storicoBody,
      headStyles: { fillColor: red, textColor: 255, fontSize: 7.5, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak", halign: "left", valign: "middle" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: M, right: M, top: HDR + 8 },
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 24 }, 2: { cellWidth: 24 }, 3: { cellWidth: 28, fontStyle: "bold" }, 4: { cellWidth: 24 } },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 3) {
          const val = data.cell.raw as string;
          if (val && val !== "—") {
            data.cell.styles.fillColor = [187, 247, 208];
            data.cell.styles.textColor = [22, 101, 52];
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text("Nessun infortunio registrato.", M, y); y += 10;
  }

  // ── PER-INJURY SECTIONS ──────────────────────────────────────────────────
  const interpretaRTS = (p: number) =>
    p >= 75 ? "Alta prontezza psicologica — Pronto per il ritorno"
    : p >= 56 ? "Prontezza moderata — Valutare con attenzione"
    : "Bassa prontezza psicologica — Ritorno non raccomandato";

  const today = new Date().toISOString().slice(0, 10);

  const getTestMainValue = (t: TestFisiometrico): number | null => {
    const avg = (...vals: (string | undefined)[]): number | null => {
      const nums = vals.map(v => parseFloat(v ?? "")).filter(v => !isNaN(v) && v > 0);
      return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    };
    if (t.rsiSx || t.rsiDx) return avg(t.rsiSx, t.rsiDx);
    if (t.rsi) { const v = parseFloat(t.rsi); return isNaN(v) ? null : v; }
    if (t.vo2max) { const v = parseFloat(t.vo2max); return isNaN(v) ? null : v; }
    if (t.tempo) { const v = parseFloat(t.tempo); return isNaN(v) ? null : v; }
    if (t.risultatoSx || t.risultatoDx) return avg(t.risultatoSx, t.risultatoDx);
    if (t.risultato) { const v = parseFloat(t.risultato); return isNaN(v) ? null : v; }
    return null;
  };

  const allInjuries: {
    id: string; diagnosi: string; tipo?: string; inizio: string; fine: string | null; attivo: boolean;
    evento?: string; meccanismo?: string; contatto?: string; lato?: string; posizione?: string;
    osiicsCodice?: string; osiicsDescrizione?: string; note?: string;
    dettaglioSituazionale?: import("@/lib/store").DettaglioSituazionaleForm;
  }[] = [
    ...storico.map((inf) => ({
      id: inf.id,
      diagnosi: inf.diagnosi,
      tipo: inf.tipo,
      inizio: inf.inizioRehab,
      fine: inf.fineRehab || null,
      attivo: inf.attivo === true,
      evento: inf.evento,
      meccanismo: inf.meccanismo,
      contatto: inf.contatto,
      lato: inf.lato,
      posizione: inf.posizioneInfortunio,
      osiicsCodice: inf.osiicsCodice,
      osiicsDescrizione: inf.osiicsDescrizione,
      note: inf.note,
      dettaglioSituazionale: inf.dettaglioSituazionale,
    })),
    ...((atleta.stato === "Infortunato" || atleta.stato === "NTL") && (atleta.infortunio || atleta.inizioRehab)
      ? [{ id: "__corrente__", diagnosi: atleta.infortunio || "—", tipo: atleta.tipoInfortunio as string | undefined, inizio: atleta.inizioRehab, fine: null as string | null, attivo: true,
          evento: atleta.evento ?? undefined, meccanismo: atleta.meccanismo ?? undefined, contatto: atleta.contatto ?? undefined,
          lato: atleta.lato ?? undefined, posizione: atleta.posizioneInfortunio ?? undefined,
          osiicsCodice: atleta.osiicsCodice ?? undefined, osiicsDescrizione: atleta.osiicsDescrizione ?? undefined,
          note: atleta.note || undefined }]
      : []),
  ].sort((a, b) => (a.inizio || "").localeCompare(b.inizio || ""));

  const usedProgIds = new Set<string>();

  for (const inj of allInjuries) {
    const injProgs = programmi
      .filter((p) => {
        if (p.infortunioId && p.infortunioId !== "__corrente__") return p.infortunioId === inj.id;
        if (p.infortunioId === "__corrente__") {
          if (inj.id === "__corrente__") {
            // Solo sessioni dalla data di inizio dell'infortunio corrente
            return !atleta.inizioRehab || !p.data || p.data >= atleta.inizioRehab;
          }
          // Sessione orfana: mappa per data sull'infortunio archiviato
          if (usedProgIds.has(p.id)) return false;
          if (!p.data || !inj.inizio) return false;
          if (p.data < inj.inizio) return false;
          if (inj.fine && p.data > inj.fine) return false;
          // Non assegnare sessioni successive all'inizio dell'infortunio corrente
          if ((atleta.stato === "Infortunato" || atleta.stato === "NTL") && atleta.inizioRehab && p.data >= atleta.inizioRehab) return false;
          return true;
        }
        // Nessun ID: match per nome sessione (priorità assoluta)
        if (nomeMatchInj(p.nome ?? "", inj.diagnosi, inj.tipo)) return true;
        if (allInjuries.some(other => other.id !== inj.id && nomeMatchInj(p.nome ?? "", other.diagnosi, other.tipo))) return false;
        // Nessun segnale nel nome: date range + dedup
        if (usedProgIds.has(p.id)) return false;
        if (!p.data || !inj.inizio) return false;
        if (p.data < inj.inizio) return false;
        if (inj.fine && p.data > inj.fine) return false;
        return true;
      })
      .sort((a, b) => a.data.localeCompare(b.data));
    // Sessioni con infortunioId esplicito (incluso __corrente__) → sempre marcate come usate.
    // Sessioni senza infortunioId → marcate solo se abbinate per data (non per nome), perché
    // quelle con nome-match possono legittimamente apparire sotto più infortuni.
    injProgs.filter(p => p.infortunioId || !nomeMatchInj(p.nome ?? "", inj.diagnosi, inj.tipo)).forEach(p => usedProgIds.add(p.id));

    const injQRTS = (atleta.questionariKinesiofobia ?? []).filter((q) => q.infortunioId === inj.id);
    const giorni = inj.fine ? ggPersi(inj.inizio, inj.fine) : ggPersi(inj.inizio, today);
    const injLabel = `${inj.diagnosi}${inj.tipo ? ` (${inj.tipo})` : ""}`;
    const sub = `${nd(atleta)}  ·  ${atleta.categoria}`;

    doc.addPage();
    addHeader(sub);
    y = HDR + 8;

    // Injury info bar (white bg, red text wrapped + underline, dates below)
    const squadraDay = injProgs.filter(p => p.squadra).sort((a, b) => a.data.localeCompare(b.data))[0];
    doc.setFont("helvetica", "bolditalic"); doc.setFontSize(9.5);
    const lineH = 5.5;
    // Diagnosi su una o più righe, tipo sempre su riga separata
    const diagLines = doc.splitTextToSize(inj.diagnosi || "—", W - 2 * M) as string[];
    const tipoLine = inj.tipo ? `(${inj.tipo})` : null;
    const allTitleLines = tipoLine ? [...diagLines, tipoLine] : diagLines;
    const titleH = allTitleLines.length * lineH;
    const barH = titleH + (squadraDay ? 20 : 14);
    doc.setFillColor(255, 255, 255); doc.rect(M, y, W - 2 * M, barH, "F");
    doc.setTextColor(...red);
    allTitleLines.forEach((line, i) => { doc.text(line, M, y + lineH + i * lineH); });
    const lastLineW = doc.getTextWidth(allTitleLines[allTitleLines.length - 1]);
    doc.setDrawColor(...red); doc.setLineWidth(0.5);
    doc.line(M, y + titleH + 1.5, M + lastLineW, y + titleH + 1.5);
    const periodY = y + titleH + 8;
    const periodStr = inj.attivo
      ? `Dal ${fmtD(inj.inizio)} - In corso (${giorni} giorni)`
      : `${fmtD(inj.inizio)} - ${fmtD(inj.fine ?? "")}  (${giorni} giorni)`;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...gray);
    doc.text(periodStr, M, periodY);
    if (squadraDay) {
      doc.setFont("helvetica", "bold"); doc.setTextColor(22, 101, 52);
      doc.text(`Ritorno in squadra: ${fmtD(squadraDay.data)}`, M, periodY + 7);
    }
    y += barH + 4;

    // ── Dati clinici ────────────────────────────────────────────────────────
    {
      const osiics = [inj.osiicsCodice, inj.osiicsDescrizione].filter(Boolean).join(" — ");
      const clinFields: [string, string][] = ([
        ["Diagnosi", inj.diagnosi],
        ["Tipologia", inj.tipo],
        ["Sede anatomica", inj.posizione],
        ["Evento", inj.evento],
        ["Meccanismo", inj.meccanismo],
        ["Contatto", inj.contatto],
        ["Lato", inj.lato],
        ["Codice OSIICS", osiics || undefined],
        ["Note cliniche", inj.note],
      ] as [string, string | undefined][]).filter((r): r is [string, string] => !!r[1]?.trim());
      if (clinFields.length > 0) {
        checkPage(10 + clinFields.length * 7, sub);
        autoTable(doc, {
          startY: y,
          body: clinFields,
          columnStyles: {
            0: { cellWidth: 40, fontStyle: "bold", fillColor: [245, 245, 245], textColor: 50 },
            1: { textColor: 30 },
          },
          bodyStyles: { fontSize: 8, cellPadding: 2.5 },
          margin: { left: M, right: M, top: HDR + 8 },
        });
        y = (doc as any).lastAutoTable.finalY + 5;
      }
    }

    // Dettaglio situazionale embedded (infortuni concorrenti / storici)
    if (inj.dettaglioSituazionale) {
      const d = inj.dettaglioSituazionale;
      const detRows: [string, string][] = ([
        d.fonte_informazione?.length ? ["Fonte informazione", d.fonte_informazione.join(", ") + (d.fonte_informazione_altro ? ` — ${d.fonte_informazione_altro}` : "")] : null,
        d.giorni_referto ? ["Giorni a referto", d.giorni_referto] : null,
        d.modalita_insorgenza ? ["Modalità insorgenza", d.modalita_insorgenza + (d.modalita_insorgenza_altro ? ` — ${d.modalita_insorgenza_altro}` : "")] : null,
        d.attivita_fisica ? ["Attività fisica", d.attivita_fisica] : null,
        d.tipo_corsa ? ["Tipo corsa", d.tipo_corsa] : null,
        d.corsa_gradi ? ["Gradi cambio direzione", d.corsa_gradi] : null,
        d.corsa_gamba_coinvolta ? ["Gamba coinvolta", d.corsa_gamba_coinvolta] : null,
        d.salto_fase ? ["Fase salto", d.salto_fase] : null,
        d.salto_atterraggio_dove ? ["Atterraggio su", d.salto_atterraggio_dove] : null,
        d.salto_gamba_atterraggio ? ["Gamba atterraggio", d.salto_gamba_atterraggio] : null,
        d.caduta_dettagli ? ["Dettagli caduta", d.caduta_dettagli] : null,
        d.contatto_dettaglio ? ["Tipo contatto", d.contatto_dettaglio] : null,
        d.situazione_duello ? ["Situazione duello", d.situazione_duello] : null,
        d.direzione_contrasto ? ["Direzione contrasto", d.direzione_contrasto] : null,
        d.collisione_con ? ["Collisione con", d.collisione_con] : null,
        d.duello_aereo ? ["Duello aereo", d.duello_aereo] : null,
        d.azione_con_palla != null && d.azione_con_palla !== false ? ["Azione con palla", "Sì"] : null,
        d.situazione_gioco_palla ? ["Situazione di gioco", d.situazione_gioco_palla] : null,
        d.attivita_con_palla ? ["Attività con palla", d.attivita_con_palla] : null,
        d.calcio_azione ? ["Azione di calcio", d.calcio_azione] : null,
        d.calcio_intensita ? ["Intensità calcio", d.calcio_intensita] : null,
        d.calcio_tipo ? ["Tipo calcio", d.calcio_tipo] : null,
        d.calcio_fase ? ["Fase calcio", d.calcio_fase] : null,
        d.dribbling_tipo ? ["Tipo dribbling", d.dribbling_tipo] : null,
        d.palla_altezza ? ["Altezza palla", d.palla_altezza] : null,
        d.tipo_seduta ? ["Tipo seduta", d.tipo_seduta + (d.tipo_esercitazione ? ` — ${d.tipo_esercitazione}` : "")] : null,
        d.partita_sede ? ["Sede partita", d.partita_sede] : null,
        d.partita_competizione ? ["Competizione", d.partita_competizione] : null,
        d.partita_punteggio ? ["Punteggio", d.partita_punteggio] : null,
        d.fase_gioco ? ["Fase di gioco", d.fase_gioco + (d.sotto_fase_gioco ? ` — ${d.sotto_fase_gioco}` : "")] : null,
        d.terreno_gioco ? ["Terreno di gioco", d.terreno_gioco] : null,
        d.decisione_arbitrale ? ["Decisione arbitrale", d.decisione_arbitrale] : null,
        d.minuto_infortunio ? ["Minuto infortunio", `${d.minuto_infortunio}'`] : null,
        d.minuti_giocati_prima ? ["Minuti giocati prima", `${d.minuti_giocati_prima}'`] : null,
      ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null);
      if (detRows.length > 0) {
        checkPage(20, sub);
        y = secTitle("Dettaglio Situazionale (FIICCS)", y);
        autoTable(doc, {
          startY: y,
          body: detRows,
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak", halign: "left", valign: "middle" },
          columnStyles: {
            0: { cellWidth: 70, fontStyle: "bold", textColor: [30, 64, 175] as [number, number, number] },
            1: { textColor: dark },
          },
          alternateRowStyles: { fillColor: [239, 246, 255] as [number, number, number] },
          margin: { left: M, right: M, top: HDR + 8 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }
    }

    // Dettaglio situazionale infortunio corrente (camelCase, passato come parametro)
    if (inj.id === "__corrente__" && dettaglio) {
      const fiiccsRows: [string, string][] = [
        dettaglio.fonteInformazione?.length ? ["Fonte informazione", dettaglio.fonteInformazione.join(", ")] : null,
        dettaglio.giorniReferto != null ? ["Giorni a referto", `${dettaglio.giorniReferto}`] : null,
        dettaglio.modalitaInsorgenza ? ["Modalità insorgenza", dettaglio.modalitaInsorgenza + (dettaglio.modalitaInsorgenzaAltro ? ` — ${dettaglio.modalitaInsorgenzaAltro}` : "")] : null,
        dettaglio.attivitaFisica ? ["Attività fisica", dettaglio.attivitaFisica] : null,
        dettaglio.tipoCorsa ? ["Tipo corsa", dettaglio.tipoCorsa] : null,
        dettaglio.corsaGradi ? ["Gradi cambio direzione", dettaglio.corsaGradi] : null,
        dettaglio.corsaGambaCoinvolta ? ["Gamba coinvolta", dettaglio.corsaGambaCoinvolta] : null,
        dettaglio.saltoFase ? ["Fase salto", dettaglio.saltoFase] : null,
        dettaglio.saltoAtterraggioDove ? ["Atterraggio su", dettaglio.saltoAtterraggioDove] : null,
        dettaglio.saltoGambaAtterraggio ? ["Gamba atterraggio", dettaglio.saltoGambaAtterraggio] : null,
        dettaglio.cadutaDettagli ? ["Dettagli caduta", dettaglio.cadutaDettagli] : null,
        dettaglio.contattoDettaglio ? ["Tipo contatto", dettaglio.contattoDettaglio] : null,
        dettaglio.situazioneDuello ? ["Situazione duello", dettaglio.situazioneDuello] : null,
        dettaglio.direzioneContrasto ? ["Direzione contrasto", dettaglio.direzioneContrasto] : null,
        dettaglio.collisioneCon ? ["Collisione con", dettaglio.collisioneCon] : null,
        dettaglio.duelloAereo != null ? ["Duello aereo", dettaglio.duelloAereo ? "Sì" : "No"] : null,
        dettaglio.azioneConPalla != null ? ["Azione con palla", dettaglio.azioneConPalla ? "Sì" : "No"] : null,
        dettaglio.situazioneGiocoPalla ? ["Situazione di gioco", dettaglio.situazioneGiocoPalla] : null,
        dettaglio.attivitaConPalla ? ["Attività con palla", dettaglio.attivitaConPalla] : null,
        dettaglio.calcioAzione ? ["Azione di calcio", dettaglio.calcioAzione] : null,
        dettaglio.calcioIntensita ? ["Intensità calcio", dettaglio.calcioIntensita] : null,
        dettaglio.calcioTipo ? ["Tipo calcio", dettaglio.calcioTipo] : null,
        dettaglio.calcioFase ? ["Fase calcio", dettaglio.calcioFase] : null,
        dettaglio.dribblingTipo ? ["Tipo dribbling", dettaglio.dribblingTipo] : null,
        dettaglio.pallaAltezza ? ["Altezza palla", dettaglio.pallaAltezza] : null,
        dettaglio.tipoSeduta ? ["Tipo seduta", dettaglio.tipoSeduta] : null,
        dettaglio.tipoEsercitazione ? ["Tipo esercitazione", dettaglio.tipoEsercitazione] : null,
        dettaglio.partitaSede ? ["Sede partita", dettaglio.partitaSede] : null,
        dettaglio.partitaCompetizione ? ["Competizione", dettaglio.partitaCompetizione] : null,
        dettaglio.partitaPunteggio ? ["Punteggio", dettaglio.partitaPunteggio] : null,
        dettaglio.faseGioco ? ["Fase di gioco", dettaglio.faseGioco] : null,
        dettaglio.sottoFaseGioco ? ["Sotto-fase di gioco", dettaglio.sottoFaseGioco] : null,
        dettaglio.terrenoGioco ? ["Terreno di gioco", dettaglio.terrenoGioco] : null,
        dettaglio.decisioneArbitrale ? ["Decisione arbitrale", dettaglio.decisioneArbitrale] : null,
        dettaglio.minutoInfortunio != null ? ["Minuto infortunio", `${dettaglio.minutoInfortunio}'`] : null,
        dettaglio.minutiGiocatiPrima != null ? ["Minuti giocati prima", `${dettaglio.minutiGiocatiPrima}'`] : null,
      ].filter((r): r is [string, string] => r !== null);
      if (fiiccsRows.length > 0) {
        checkPage(20, sub);
        y = secTitle("Dettaglio Situazionale (FIICCS)", y);
        autoTable(doc, {
          startY: y,
          body: fiiccsRows,
          theme: "striped",
          styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak", halign: "left", valign: "middle" },
          columnStyles: {
            0: { cellWidth: 70, fontStyle: "bold", textColor: [30, 64, 175] as [number, number, number] },
            1: { textColor: dark },
          },
          alternateRowStyles: { fillColor: [239, 246, 255] as [number, number, number] },
          margin: { left: M, right: M, top: HDR + 8 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }
    }

    // RTS evaluations for this injury
    if (injQRTS.length > 0) {
      doc.addPage(); addHeader(sub); y = HDR + 8;
      y = secTitle("Valutazione psicologica – TSK / AFAQ", y);
      autoTable(doc, {
        startY: y,
        head: [["Data", "Test", "Punteggio", "Interpretazione"]],
        body: [...injQRTS].sort((a, b) => a.data.localeCompare(b.data)).map((q) => [
          new Date(q.data + "T12:00").toLocaleDateString("it-IT"),
          q.tipoTest ?? "—",
          `${q.punteggio} / ${q.tipoTest === "TSK" ? 40 : 42}`,
          interpretaRTS(q.punteggio),
        ]),
        headStyles: hS(dark),
        bodyStyles: bS,
        alternateRowStyles: aS,
        margin: { left: M, right: M, top: HDR + 8 },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 20, fontStyle: "bold" }, 2: { cellWidth: 28, fontStyle: "bold" } },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Programs for this injury
    if (injProgs.length > 0) {
      doc.addPage(); addHeader(sub); y = HDR + 8;
      y = secTitle(`Sessioni di lavoro — ${injProgs.filter(isSessionePDF).length} sessioni`, y);
      renderWeeklyTable(injProgs, sub);

      // ── Test per tipologia (tabella + grafico) ───────────────────────────
      {
        const testsByName = new Map<string, { dateLabel: string; dateFull: string; sessione: string; test: TestFisiometrico; val: string }[]>();
        for (const prog of injProgs) {
          if (prog.assente || prog.riposo) continue;
          for (const t of (prog.tests ?? [])) {
            const dateLabel = prog.data ? new Date(prog.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "—";
            const dateFull = prog.data ? fmtD(prog.data) : "—";
            const isSL = t.nome === "SL Drop Jump";
            const val = [
              t.risultato,
              t.altezzaSalto ? `${t.altezzaSalto} cm` : "",
              t.risultatoSx ? `Sx ${t.risultatoSx}` : "",
              t.risultatoDx ? `Dx ${t.risultatoDx}` : "",
              t.altezzaSaltoSx ? `Sx ↕${t.altezzaSaltoSx}cm` : "",
              t.altezzaSaltoDx ? `Dx ↕${t.altezzaSaltoDx}cm` : "",
              t.tempoContatto ? `Contatto: ${t.tempoContatto}s` : "",
              t.rsi ? `RSI: ${t.rsi}` : "",
              isSL && t.tempoContattoSx ? `Sx Cont.: ${t.tempoContattoSx}s` : "",
              isSL && t.tempoContattoDx ? `Dx Cont.: ${t.tempoContattoDx}s` : "",
              isSL && t.rsiSx ? `RSI Sx: ${t.rsiSx}` : "",
              isSL && t.rsiDx ? `RSI Dx: ${t.rsiDx}` : "",
              t.tempo ? `Tempo: ${t.tempo}s` : "",
              t.livello ? `Liv: ${t.livello}` : "",
              t.vo2max ? `Vo2Max: ${t.vo2max}` : "",
              t.vam ? `VAM: ${t.vam}` : "",
              t.ginocchioDx ? `Gin.Dx: ${t.ginocchioDx}°` : "",
              t.ancaSx ? `Anca Sx: ${t.ancaSx}°` : "",
              t.diffGinocchioDxAncaSx ? `D Dx/Sx: ${t.diffGinocchioDxAncaSx}°` : "",
              t.ginocchioSx ? `Gin.Sx: ${t.ginocchioSx}°` : "",
              t.ancaDx ? `Anca Dx: ${t.ancaDx}°` : "",
              t.diffGinocchioSxAncaDx ? `D Sx/Dx: ${t.diffGinocchioSxAncaDx}°` : "",
            ].filter(Boolean).join(" / ");
            if (!testsByName.has(t.nome)) testsByName.set(t.nome, []);
            testsByName.get(t.nome)!.push({ dateLabel, dateFull, sessione: injLabel, test: t, val: val || "—" });
          }
        }
        if (testsByName.size > 0) {
          doc.addPage(); addHeader(sub); y = HDR + 8;
          y = secTitle("Test", y);

          type TEntry = { dateLabel: string; dateFull: string; sessione: string; test: TestFisiometrico; val: string };
          const HALF_W = Math.floor((W - 2 * M - 6) / 2);
          const GAP = 6;

          const buildTestData = (nome: string, rawEntries: any[], colorIdx: number) => {
            const entries = rawEntries as TEntry[];
            const color: [number, number, number] = colorIdx % 2 === 0 ? [200, 16, 46] : [75, 85, 99];
            const isSprintTempo = ["Sprint 10m", "Sprint 20m", "Sprint 30m", "10x100m"].includes(nome);
            const isGaconIFT = nome === "Gacon" || nome === "IFT 30-15";
            const isDropJump = nome === "Drop Jump";
            const isSLDropJump = nome === "SL Drop Jump";
            const isJurdan = nome === "Jurdan";
            const isCMJLike = (nome.includes("CMJ") && !nome.includes("SL")) || nome === "Squat Jump";
            const isBroadJump = nome.includes("Broad Jump");
            const hasSxDx = !isJurdan && !isCMJLike && !isBroadJump && entries.some((e) => e.test.risultatoSx || e.test.risultatoDx);

            let head: string[];
            let dataRows: string[][];

            if (isDropJump) {
              head = ["Data", "Alt. (cm)", "Cont. (s)", "RSI"];
              dataRows = entries.map((e) => [e.dateFull, e.test.altezzaSalto || "—", e.test.tempoContatto || "—", e.test.rsi || "—"]);
            } else if (isSLDropJump) {
              head = ["Data", "RSI Sx", "RSI Dx", "Asim. %"];
              dataRows = entries.map((e) => {
                const asim = _calcolaAsimmetria(e.test.rsiSx ?? "", e.test.rsiDx ?? "");
                return [e.dateFull, e.test.rsiSx || "—", e.test.rsiDx || "—", asim !== null ? `${asim.toFixed(1)}%` : "—"];
              });
            } else if (isSprintTempo) {
              head = ["Data", "Tempo (s)"];
              dataRows = entries.map((e) => [e.dateFull, e.test.tempo || "—"]);
            } else if (isGaconIFT) {
              head = ["Data", "Livello", "Vo2Max", "VAM"];
              dataRows = entries.map((e) => [e.dateFull, e.test.livello || "—", e.test.vo2max || "—", e.test.vam || "—"]);
            } else if (isJurdan) {
              head = ["Data", "Gin.Dx°", "Anca Sx°", "Σ Dx/Sx", "Gin.Sx°", "Anca Dx°", "Σ Sx/Dx"];
              dataRows = entries.map((e) => {
                const gDx = parseFloat(e.test.ginocchioDx ?? ""), aSx = parseFloat(e.test.ancaSx ?? "");
                const gSx = parseFloat(e.test.ginocchioSx ?? ""), aDx = parseFloat(e.test.ancaDx ?? "");
                const d1 = e.test.diffGinocchioDxAncaSx ?? ((!isNaN(gDx) && !isNaN(aSx)) ? (gDx + aSx).toFixed(1) : "—");
                const d2 = e.test.diffGinocchioSxAncaDx ?? ((!isNaN(gSx) && !isNaN(aDx)) ? (gSx + aDx).toFixed(1) : "—");
                return [e.dateFull, e.test.ginocchioDx || "—", e.test.ancaSx || "—", d1, e.test.ginocchioSx || "—", e.test.ancaDx || "—", d2];
              });
            } else if (isCMJLike) {
              head = ["Data", "Alt. (cm)"];
              dataRows = entries.map((e) => [e.dateFull, e.test.altezzaSalto || "—"]);
            } else if (isBroadJump) {
              head = ["Data", "Dist. (cm)"];
              dataRows = entries.map((e) => [e.dateFull, e.test.altezzaSalto || "—"]);
            } else if (hasSxDx) {
              const isQSLS = nome === "QSLS";
              const unitSx = entries[0]?.test.unita ? ` (${entries[0].test.unita})` : "";
              head = isQSLS ? ["Data", `Sx${unitSx}`, `Dx${unitSx}`] : ["Data", `Sx${unitSx}`, `Dx${unitSx}`, "Asim. %"];
              dataRows = entries.map((e) => {
                if (isQSLS) return [e.dateFull, e.test.risultatoSx || "—", e.test.risultatoDx || "—"];
                const asim = _calcolaAsimmetria(e.test.risultatoSx, e.test.risultatoDx);
                return [e.dateFull, e.test.risultatoSx || "—", e.test.risultatoDx || "—", asim !== null ? `${asim.toFixed(1)}%` : "—"];
              });
            } else {
              head = ["Data", `Risultato${entries[0]?.test.unita ? ` (${entries[0].test.unita})` : ""}`];
              dataRows = entries.map((e) => [e.dateFull, e.test.risultato || e.val]);
            }

            const asimCol = (isSLDropJump || (hasSxDx && nome !== "QSLS")) ? 3 : -1;
            const avgRow: string[] = ["Media"];
            for (let c = 1; c < head.length; c++) {
              const nums = dataRows.map(r => parseFloat(r[c])).filter(v => !isNaN(v));
              avgRow.push(nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "—");
            }
            const hasTrend = dataRows.length >= 2;
            const trendRow: string[] = ["Trend"];
            if (hasTrend) {
              for (let c = 1; c < head.length; c++) {
                const first = parseFloat(dataRows[0][c]), last = parseFloat(dataRows[dataRows.length - 1][c]);
                if (!isNaN(first) && !isNaN(last) && Math.abs(first) > 0) {
                  const pct = ((last - first) / Math.abs(first)) * 100;
                  trendRow.push(`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`);
                } else { trendRow.push("—"); }
              }
            }
            const noteRowIndices = new Set<number>();
            const body: any[] = [];
            dataRows.forEach((row, i) => {
              body.push(row);
              const noteText = entries[i]?.test.note?.trim();
              if (noteText) {
                noteRowIndices.add(body.length);
                body.push([{ content: noteText, colSpan: head.length }]);
              }
            });
            const avgRowIdx = body.length;
            const trendRowIdx = hasTrend ? body.length + 1 : -1;
            body.push(avgRow);
            if (hasTrend) body.push(trendRow);
            return { head, body, color, asimCol, avgRowIdx, trendRowIdx, noteRowIndices };
          };

          const testEntries = Array.from(testsByName.entries());
          for (let pi = 0; pi < testEntries.length; pi += 2) {
            const [leftNome, leftRaw] = testEntries[pi];
            const rightEntry = testEntries[pi + 1] ?? null;
            const leftData = buildTestData(leftNome, leftRaw, pi);
            const rightData = rightEntry ? buildTestData(rightEntry[0], rightEntry[1], pi + 1) : null;
            const maxRows = Math.max(leftData.body.length, rightData ? rightData.body.length : 0);
            checkPage(15 + maxRows * 7, sub);

            doc.setFont("helvetica", "bolditalic"); doc.setFontSize(7.5); doc.setTextColor(20, 20, 20);
            doc.text(leftNome, M, y + 5);
            if (rightData) doc.text(rightEntry![0], M + HALF_W + GAP, y + 5);
            y += 9;
            const pairStartY = y;

            const renderHalf = (td: ReturnType<typeof buildTestData>, mL: number, mR: number) => {
              autoTable(doc, {
                startY: pairStartY,
                head: [td.head],
                body: td.body,
                headStyles: { fillColor: td.color, textColor: [255, 255, 255] as [number, number, number], fontSize: 6, fontStyle: "bold" as const, halign: "center" as const, valign: "middle" as const, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
                bodyStyles: { fontSize: 6, cellPadding: 2, overflow: "linebreak" as const, valign: "middle" as const, halign: "center" as const },
                margin: { left: mL, right: mR, top: HDR + 8 },
                columnStyles: { 0: { cellWidth: 14, halign: "left" as const } },
                didDrawPage: () => { addHeader(sub); },
                didParseCell: (data: any) => {
                  if (data.section !== "body") return;
                  const ri = data.row.index;
                  if (td.noteRowIndices.has(ri)) {
                    data.cell.styles.fillColor = [255, 255, 255]; data.cell.styles.fontStyle = "italic";
                    data.cell.styles.textColor = [130, 130, 130]; data.cell.styles.fontSize = 5.5;
                  } else if (ri === td.avgRowIdx) {
                    data.cell.styles.fillColor = [229, 231, 235]; data.cell.styles.fontStyle = "bold";
                  } else if (ri === td.trendRowIdx) {
                    data.cell.styles.fillColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold";
                    if (data.column.index > 0) {
                      const raw = String(data.cell.raw ?? "");
                      if (raw.startsWith("+")) data.cell.styles.textColor = [22, 101, 52];
                      else if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38];
                    }
                  } else if (td.asimCol !== -1 && data.column.index === td.asimCol) {
                    const v = parseFloat(String(data.cell.raw ?? ""));
                    if (!isNaN(v) && v > 10) { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = "bold"; }
                  } else if (ri % 2 === 1) {
                    data.cell.styles.fillColor = [247, 248, 252];
                  } else {
                    data.cell.styles.fillColor = [255, 255, 255];
                  }
                },
              });
            };

            renderHalf(leftData, M, W - M - HALF_W);
            const leftFinalY = (doc as any).lastAutoTable.finalY;
            if (rightData) {
              renderHalf(rightData, M + HALF_W + GAP, M);
              y = Math.max(leftFinalY, (doc as any).lastAutoTable.finalY) + 8;
            } else {
              y = leftFinalY + 8;
            }
          }
        }
      }

      // ── Analisi Carico e Performance ──────────────────────────────────────
      const caricoSessions: CaricoSession[] = injProgs.filter(isSessionePDF).map((p) => {
        const ca = p.carico;
        return {
          dateLabel: p.data ? new Date(p.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "—",
          dateFull: p.data ? fmtD(p.data) : "—",
          fase: p.fase ?? "—",
          rpe: pn(ca?.rpe), interno: pn(ca?.interno), durata: pn(ca?.durata),
          distanza: pn(ca?.distanzaTotale), hsr: pn(ca?.hsr),
          vel21: pn(ca?.velocita21), vel25: pn(ca?.velocita25), velMax: pn(ca?.velocitaMax),
          acc: pn(ca?.accelerazioni), dec: pn(ca?.decelerazioni),
          sprint: pn(ca?.sprint), potenza: pn(ca?.potenzaMetabolica),
        };
      });
      // Section only appears if internal-load data (RPE or Carico Interno) exists.
      // GPS columns in the table are added dynamically if collected; otherwise only RPE/interno show.
      const hasCarico = caricoSessions.some((s) =>
        s.rpe !== null || s.interno !== null || s.distanza !== null || s.hsr !== null ||
        s.vel21 !== null || s.vel25 !== null || s.velMax !== null ||
        s.acc !== null || s.dec !== null || s.sprint !== null || s.potenza !== null
      );
      if (hasCarico) {
        doc.addPage(); addHeader(sub); y = HDR + 8;
        y = secTitle("Analisi Carico e Performance", y);

        type MetricCol = { label: string; unit: string; dec: number; w: number; get: (s: CaricoSession) => number | null };
        const allMetricCols: MetricCol[] = [
          { label: "Durata\n(min)",    unit: "min",  dec: 0, w: 14, get: (s) => s.durata },
          { label: "RPE\n(/10)",       unit: "/10",  dec: 1, w: 14, get: (s) => s.rpe },
          { label: "TL\n(UA)",          unit: "UA",   dec: 0, w: 16, get: (s) => s.interno },
          { label: "Dist.\n(m)",       unit: "m",    dec: 0, w: 16, get: (s) => s.distanza },
          { label: "D>16km/h\n(m)",     unit: "m",    dec: 0, w: 16, get: (s) => s.hsr },
          { label: "D>20km/h\n(m)",     unit: "m",    dec: 0, w: 16, get: (s) => s.vel21 },
          { label: "D>25km/h\n(m)",     unit: "m",    dec: 0, w: 16, get: (s) => s.vel25 },
          { label: "Vel.Max\n(km/h)",  unit: "km/h", dec: 1, w: 16, get: (s) => s.velMax },
          { label: "N.Acc.",           unit: "",     dec: 0, w: 12, get: (s) => s.acc },
          { label: "N.Dec.",           unit: "",     dec: 0, w: 12, get: (s) => s.dec },
          { label: "N.Sprint",         unit: "",     dec: 0, w: 12, get: (s) => s.sprint },
          { label: "Potenza\n(W/kg)",  unit: "W/kg", dec: 1, w: 14, get: (s) => s.potenza },
        ];
        const activeCols = allMetricCols.filter(({ get: getV }) =>
          caricoSessions.some((s) => getV(s) !== null)
        );
        const fmtV = (v: number | null, dec: number, unit: string) =>
          v !== null ? `${v.toFixed(dec)}${unit ? ` ${unit}` : ""}` : "—";

        const sessionRows = caricoSessions.map((s) => [
          s.dateFull, s.fase,
          ...activeCols.map(({ dec, unit, get: getV }) => fmtV(getV(s), dec, unit)),
        ]);
        const avgRow = [
          "Valori medi", "—",
          ...activeCols.map(({ dec, unit, get: getV }) => {
            const vals = caricoSessions.map(getV).filter((v): v is number => v !== null);
            return vals.length ? fmtV(vals.reduce((a, b) => a + b, 0) / vals.length, dec, unit) : "—";
          }),
        ];

        const metricW = activeCols.reduce((s, c) => s + c.w, 0);
        const scale = (W - 2 * M - 34) / Math.max(metricW, 1);
        const colStyles: Record<number, any> = {
          0: { cellWidth: 16, halign: "center" as const },
          1: { cellWidth: 18 },
        };
        activeCols.forEach((c, i) => {
          colStyles[i + 2] = { cellWidth: Math.round(c.w * scale * 10) / 10, halign: "center" as const };
        });

        checkPage(sessionRows.length * 6 + 20, sub);
        autoTable(doc, {
          startY: y,
          head: [["Data", "Fase", ...activeCols.map((c) => c.label)]],
          body: [...sessionRows, avgRow],
          headStyles: { fillColor: [200, 16, 46] as [number,number,number], textColor: [255,255,255] as [number,number,number], fontSize: 5.5, halign: "center" as const, valign: "middle" as const, cellPadding: { top: 3, bottom: 3, left: 1.5, right: 1.5 } },
          bodyStyles: { fontSize: 6.5, cellPadding: 2, halign: "left" as const, valign: "middle" as const },
          alternateRowStyles: { fillColor: [250, 250, 250] as [number,number,number] },
          margin: { left: M, right: M, top: HDR + 8 },
          columnStyles: colStyles,
          didParseCell: (data: any) => {
            if (data.section === "body" && data.row.index === sessionRows.length) {
              data.cell.styles.fontStyle = "bolditalic";
              data.cell.styles.textColor = [0, 0, 0];
              data.cell.styles.fillColor = [255, 245, 245];
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 8;

        // Dual-axis chart: bars=Training Load (left axis, UA), RPE line (right axis, 0-10)
        const chartSessions = caricoSessions.filter(
          (s) => s.rpe !== null || s.interno !== null
        );
        if (chartSessions.length >= 1) {
          checkPage(74, sub);
          const n = chartSessions.length;
          const cX = M; const cW = W - 2 * M; const cH = 56; const cY = y + 8;
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...dark);
          doc.text("Andamento Training Load", M, y + 2);
          doc.setFillColor(249, 250, 251); doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
          doc.rect(cX, cY, cW, cH, "FD");
          const PAD = { top: 5, right: 18, bottom: 10, left: 20 };
          const plotX = cX + PAD.left; const plotW = cW - PAD.left - PAD.right;
          const plotY = cY + PAD.top; const plotH = cH - PAD.top - PAD.bottom;

          const tlVals = chartSessions.map((s) => s.interno).filter((v): v is number => v !== null);
          const rawMaxTL = tlVals.length ? Math.max(...tlVals) : 400;
          const maxTL = Math.ceil(rawMaxTL / 100) * 100 || 100;
          const maxRPE = 10;

          const barW = Math.min((plotW / n) * 0.6, 14);
          const gX = (i: number) => plotX + (i + 0.5) * (plotW / n);
          const gY_tl  = (v: number) => plotY + plotH - (v / maxTL)  * plotH;
          const gY_rpe = (v: number) => plotY + plotH - (v / maxRPE) * plotH;

          // Grid lines
          for (let t = 0; t <= 5; t++) {
            const gy = plotY + (t / 5) * plotH;
            doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.15);
            doc.line(plotX, gy, plotX + plotW, gy);
          }

          // Left Y-axis: Training Load (dark)
          for (let t = 0; t <= 4; t++) {
            const tlv = Math.round((maxTL / 4) * t);
            const ty = gY_tl(tlv);
            doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...dark);
            doc.text(`${tlv}`, plotX - 1.5, ty + 1.5, { align: "right" });
          }
          doc.setFontSize(4.5); doc.setFont("helvetica", "bold");
          doc.setTextColor(...dark); doc.text("TL (UA)", plotX - 1.5, plotY - 1, { align: "right" });

          // Right Y-axis: RPE (red, 0-10)
          for (let t = 0; t <= 5; t++) {
            const rv = t * 2;
            const ty = gY_rpe(rv);
            doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(200, 16, 46);
            doc.text(`${rv}`, plotX + plotW + 1.5, ty + 1.5, { align: "left" });
          }
          doc.setFontSize(4.5); doc.setFont("helvetica", "bold");
          doc.setTextColor(200, 16, 46); doc.text("RPE", plotX + plotW + 1.5, plotY - 1, { align: "left" });

          // Bars: Training Load (dark navy/slate)
          chartSessions.forEach((s, i) => {
            if (s.interno === null) return;
            const bx = gX(i) - barW / 2;
            const bh = (s.interno / maxTL) * plotH;
            const r = Math.min(1.0, barW / 2, bh / 2);
            doc.setFillColor(55, 65, 81); doc.setDrawColor(37, 47, 63); doc.setLineWidth(0.15);
            doc.roundedRect(bx, plotY + plotH - bh, barW, bh, r, r, "FD");
          });

          // RPE line (right axis, red solid) – smooth Catmull-Rom
          doc.setDrawColor(200, 16, 46); doc.setLineWidth(0.6); doc.setLineDashPattern([], 0);
          const rpePts = chartSessions
            .map((s, i) => s.rpe !== null ? { i, v: s.rpe } : null)
            .filter((p): p is { i: number; v: number } => p !== null);
          if (rpePts.length >= 2) {
            const tension = 0.25;
            const rx = (k: number) => gX(rpePts[Math.max(0, Math.min(rpePts.length - 1, k))].i);
            const ry = (k: number) => gY_rpe(rpePts[Math.max(0, Math.min(rpePts.length - 1, k))].v);
            doc.moveTo(rx(0), ry(0));
            for (let k = 0; k < rpePts.length - 1; k++) {
              doc.curveTo(
                rx(k)   + (rx(k + 1) - rx(k - 1)) * tension,
                ry(k)   + (ry(k + 1) - ry(k - 1)) * tension,
                rx(k+1) - (rx(k + 2) - rx(k))     * tension,
                ry(k+1) - (ry(k + 2) - ry(k))     * tension,
                rx(k + 1), ry(k + 1)
              );
            }
            doc.stroke();
          }
          chartSessions.forEach((s, i) => {
            if (s.rpe === null) return;
            const px = gX(i); const py = gY_rpe(s.rpe);
            doc.setFillColor(200, 16, 46); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.35);
            doc.circle(px, py, 0.8, "FD");
            const barTop = s.interno !== null ? plotY + plotH - (s.interno / maxTL) * plotH : plotY;
            const insideBar = py - 2.5 >= barTop;
            doc.setFontSize(5); doc.setFont("helvetica", "bold");
            doc.setTextColor(...(insideBar ? ([255, 255, 255] as [number,number,number]) : ([200, 16, 46] as [number,number,number])));
            doc.text(`${s.rpe.toFixed(1)}`, px, py - 2.5, { align: "center" });
          });

          // X-axis dates
          const step = n <= 12 ? 1 : n <= 24 ? 2 : Math.ceil(n / 12);
          doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
          chartSessions.forEach((s, i) => {
            if (i % step === 0) doc.text(s.dateLabel, gX(i), cY + cH + 4, { align: "center" });
          });

          // Legend
          const legY = cY + cH + 9;
          doc.setFillColor(55, 65, 81); doc.setDrawColor(37, 47, 63); doc.setLineWidth(0.15);
          doc.roundedRect(cX, legY - 2.5, 9, 4.5, 0.8, 0.8, "FD");
          doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...dark);
          doc.text("Training Load (UA)", cX + 11, legY + 1.5);
          const leg2X = cX + 60;
          doc.setDrawColor(200, 16, 46); doc.setLineWidth(0.6); doc.setLineDashPattern([], 0);
          doc.line(leg2X, legY, leg2X + 9, legY);
          doc.setFillColor(200, 16, 46); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.35);
          doc.circle(leg2X + 4.5, legY, 0.7, "FD");
          doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...dark);
          doc.text("RPE (scala 0-10)", leg2X + 11, legY + 1.5);
          y = legY + 10;
        }

        // ── Grafici Carico Esterno GPS ──────────────────────────────────
        const CRE: [number,number,number][] = [
          [200, 16, 46],  // rosso Cremonese
          [75, 85, 99],   // grigio
        ];
        const extMetrics: { label: string; color: [number,number,number]; getData: (s: CaricoSession) => number | null }[] = [
          { label: "Distanza Totale (m)",        color: CRE[0], getData: (s) => s.distanza },
          { label: "D>16 km/h (m)",              color: CRE[1], getData: (s) => s.hsr      },
          { label: "D>20 km/h (m)",              color: CRE[0], getData: (s) => s.vel21    },
          { label: "D>25 km/h (m)",              color: CRE[1], getData: (s) => s.vel25    },
          { label: "Velocità Massima (km/h)",    color: CRE[0], getData: (s) => s.velMax   },
          { label: "N. Accelerazioni",           color: CRE[1], getData: (s) => s.acc      },
          { label: "N. Decelerazioni",           color: CRE[0], getData: (s) => s.dec      },
          { label: "N. Sprint",                  color: CRE[1], getData: (s) => s.sprint   },
          { label: "Potenza Metabolica (W/kg)",  color: CRE[0], getData: (s) => s.potenza  },
        ];
        const extCharts = extMetrics
          .map(({ label, color, getData }) => ({
            label, color,
            data: caricoSessions
              .filter((s) => getData(s) !== null)
              .map((s) => ({ dateLabel: s.dateLabel, value: getData(s)! })),
          }))
          .filter(({ data }) => data.length >= 2);

        if (extCharts.length > 0) {
          const HALF_W2 = (W - 2 * M - 4) / 2;
          for (let ci = 0; ci < extCharts.length; ci += 2) {
            checkPage(62, sub);
            const c0 = extCharts[ci];
            if (ci + 1 < extCharts.length) {
              const c1 = extCharts[ci + 1];
              drawPerfChart(c0.label, c0.color as [number, number, number], c0.data, { startX: M, width: HALF_W2, updateY: false });
              drawPerfChart(c1.label, c1.color as [number, number, number], c1.data, { startX: M + HALF_W2 + 4, width: HALF_W2 });
            } else {
              drawPerfChart(c0.label, c0.color as [number, number, number], c0.data);
            }
          }
        }
      }
    } else {
      checkPage(12, sub);
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...gray);
      doc.text("Nessuna sessione registrata per questo infortunio.", M, y); y += 10;
    }
  }

  // ── Sessioni non associate ────────────────────────────────────────────────
  const unassigned = programmi
    .filter((p) => !usedProgIds.has(p.id))
    .sort((a, b) => a.data.localeCompare(b.data));

  if (unassigned.length > 0) {
    doc.addPage();
    addHeader(`${nd(atleta)}  ·  Sessioni non associate`);
    y = HDR + 8;
    y = secTitle(`Sessioni non associate a nessun infortunio — ${unassigned.filter(isSessionePDF).length} sessioni`, y);
    renderWeeklyTable(unassigned, `${nd(atleta)}  ·  Sessioni non associate`);
  }

  addFooter();
  doc.save(`${nd(atleta).replace(/ /g, "_")}_storico_completo.pdf`);
}

const statoColor: Record<Stato, string> = {
  "Infortunato": "bg-orange-100 text-orange-700",
  "NTL":         "bg-amber-100 text-amber-700",
  "Disponibile": "bg-green-100 text-green-700",
};

const FILTRI_STATO: { label: string; value: Stato | "Tutti" }[] = [
  { label: "Tutti", value: "Tutti" },
  { label: "Infortunato", value: "Infortunato" },
  { label: "NTL", value: "NTL" },
  { label: "Disponibile", value: "Disponibile" },
];

type Tab = "dati" | "cartella" | "storia";

function giorniPersi(inizio: string, fine: string): number {
  if (!inizio || !fine) return 0;
  const ms = new Date(fine).getTime() - new Date(inizio).getTime();
  return Math.max(0, Math.round(ms / 864e5));
}

export default function AtletiPage() {
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState<Stato | "Tutti">("Tutti");
  const [selected, setSelected] = useState<Atleta | null>(null);
  const [tab, setTab] = useState<Tab>("dati");
  const [mostraForm, setMostraForm] = useState(false);
  const [editAtleta, setEditAtleta] = useState<Atleta | undefined>(undefined);
  const [editStorico, setEditStorico] = useState<{ inf: InfortunioStorico; idx: number } | null>(null);
  const [editStoricoForm, setEditStoricoForm] = useState<InfortunioStorico | null>(null);
  const [programmiAtleta, setProgrammiAtleta] = useState<Programma[]>([]);
const [mostraPunteggioRTS, setMostraPunteggioRTS] = useState(false);
  const [nuovaDataRTS, setNuovaDataRTS] = useState(new Date().toISOString().split("T")[0]);
  const [nuovoPunteggioTSK, setNuovoPunteggioTSK] = useState("");
  const [nuovoPunteggioAFAQ, setNuovoPunteggioAFAQ] = useState("");
  const [nuovoInfRTS, setNuovoInfRTS] = useState("__corrente__");
  const [copiatoLink, setCopiatoLink] = useState<1 | 2 | null>(null);
  const [dettaglioSituazionale, setDettaglioSituazionale] = useState<DettaglioSituazionaleData | null>(null);
  const [tuttiDettagli, setTuttiDettagli] = useState<Record<string, DettaglioSituazionaleData>>({});
  const [dbTableReady, setDbTableReady] = useState<boolean | null>(null);
  const [sqlCopiato, setSqlCopiato] = useState(false);
  const [mostraFormInfortBis, setMostraFormInfortBis] = useState(false);
  const [nuovoInfortBis, setNuovoInfortBis] = useState({ tipo: "", diagnosi: "", inizioRehab: new Date().toISOString().slice(0, 10), note: "", evento: "", meccanismo: "", contatto: "", lato: "", posizioneInfortunio: "", osiicsCodice: "", osiicsDescrizione: "", osiicsCodeId: "" });
  const [editDatiConcorrente, setEditDatiConcorrente] = useState<string | null>(null);
  const [editDatiForm, setEditDatiForm] = useState<Partial<InfortunioStorico>>({});
  const editDettaglioRef = useRef<DettaglioSituazionaleHandle>(null);
  const nuovoDettaglioRef = useRef<DettaglioSituazionaleHandle>(null);
  const inlineDettaglioRef = useRef<DettaglioSituazionaleHandle>(null);
  const [editDettaglioAperto, setEditDettaglioAperto] = useState(false);
  const [salvandoDettaglio, setSalvandoDettaglio] = useState(false);
  const [dettaglioSalvatoOk, setDettaglioSalvatoOk] = useState(false);
  const [dettaglioErrMsg, setDettaglioErrMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; tipo: "ok" | "err" } | null>(null);
  const showToast = (text: string, tipo: "ok" | "err") => {
    setToastMsg({ text, tipo });
    setTimeout(() => setToastMsg(null), 4000);
  };
  const [mostraFondi, setMostraFondi] = useState(false);
  const [mostraFormReferto, setMostraFormReferto] = useState(false);
  const [nuovoReferto, setNuovoReferto] = useState({ data: new Date().toISOString().slice(0, 10), tipo: "", esito: "", descrizione: "", note: "" });
  const [refertoSaving, setRefertoSaving] = useState(false);
  const [refertoSalvato, setRefertoSalvato] = useState(false);

  useEffect(() => {
    loadAtleti().then(setAtleti);
    fetch("/api/migrate-dettaglio")
      .then((r) => r.json())
      .then((res) => {
        setDbTableReady(!!res.tableExists);
        if (res.tableExists) {
          loadAllDettagliSituazionali().then((all) => {
            const map: Record<string, DettaglioSituazionaleData> = {};
            all.forEach((d) => { map[d.atletaId] = d; });
            setTuttiDettagli(map);
          });
        }
      })
      .catch(() => {
        setDbTableReady(null);
        loadAllDettagliSituazionali().then((all) => {
          const map: Record<string, DettaglioSituazionaleData> = {};
          all.forEach((d) => { map[d.atletaId] = d; });
          setTuttiDettagli(map);
        });
      });
    const unsubAtleti = subscribeToAtleti(() => loadAtleti().then(setAtleti));
    const unsubIntake = subscribeToIntakeInsert(() => loadAtleti().then(setAtleti));
    return () => { unsubAtleti(); unsubIntake(); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const updated = atleti.find((a) => a.id === selected.id);
    if (updated && updated !== selected) setSelected(updated);
  }, [atleti]);

  // Quando cambia atleta: chiudi form e carica dettaglio dal cache o DB
  useEffect(() => {
    setEditDettaglioAperto(false);
    setSalvandoDettaglio(false);
    setDettaglioErrMsg(null);
    setDettaglioSalvatoOk(false);
    if (!selected || (selected.stato !== "Infortunato" && selected.stato !== "NTL")) { setDettaglioSituazionale(null); return; }
    const cached = tuttiDettagli[selected.id];
    if (cached) { setDettaglioSituazionale(cached); return; }
    loadDettaglioSituazionale(selected.id).then(setDettaglioSituazionale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setProgrammiAtleta([]); return; }
    loadProgrammi(selected.id).then(setProgrammiAtleta);
    const unsub = subscribeToProgrammi((atletaId) => {
      if (!atletaId || atletaId === selected.id) {
        loadProgrammi(selected.id).then(setProgrammiAtleta);
      }
    });
    return unsub;
  }, [selected?.id]);

  const apriNuovo = () => { setEditAtleta(undefined); setMostraForm(true); setSelected(null); };
  const apriModifica = (a: Atleta) => {
    // Clear injury-specific fields for Disponibile athletes so stale values
    // from a previous injury never pre-fill the form for the next one.
    const cleaned = a.stato === "Disponibile"
      ? { ...a, evento: undefined, meccanismo: undefined, contatto: undefined, lato: undefined, posizioneInfortunio: undefined, osiicsCodice: undefined, osiicsDescrizione: undefined, osiicsCodeId: undefined }
      : a;
    setEditAtleta(cleaned);
    setMostraForm(true);
  };

  const apriNuovoInfortunio = (a: Atleta) => {
    const template: Atleta = {
      ...a,
      stato: "Infortunato",
      infortunio: "",
      tipoInfortunio: undefined,
      inizioRehab: "",
      fineRehab: undefined,
      progresso: 0,
      evento: undefined,
      meccanismo: undefined,
      contatto: undefined,
      lato: undefined,
      posizioneInfortunio: undefined,
      osiicsCodice: undefined,
      osiicsDescrizione: undefined,
      osiicsCodeId: undefined,
    };
    setEditAtleta(template);
    setMostraForm(true);
  };

  const onSalvaAtleta = async (dati: Omit<Atleta, "id">, atletaId: string, dettaglio?: DettaglioSituazionaleForm) => {
    try {
      if (editAtleta) {
        let aggiornato: Atleta = { ...dati, id: editAtleta.id };
        // Se l'atleta passa da Infortunato/NTL a Disponibile, archivia l'infortunio corrente
        if ((editAtleta.stato === "Infortunato" || editAtleta.stato === "NTL") && dati.stato === "Disponibile") {
          const fineRehab = dati.fineRehab ?? new Date().toISOString().slice(0, 10);
          const diagnosi = dati.infortunio || editAtleta.infortunio;
          const inizioRehab = dati.inizioRehab || editAtleta.inizioRehab;
          const tipo = dati.tipoInfortunio || editAtleta.tipoInfortunio;
          if (diagnosi || inizioRehab) {
            const inf: InfortunioStorico = {
              id: uid(),
              tipo,
              diagnosi: diagnosi || "—",
              inizioRehab: inizioRehab || "",
              fineRehab,
              note: dati.note || editAtleta.note || undefined,
            };
            // Also close any concurrent injuries that were open at the same time
            const storicoChiuso = (editAtleta.storicoInfortuni ?? []).map((s) =>
              s.attivo ? { ...s, attivo: undefined as unknown as true, fineRehab: s.fineRehab || fineRehab } : s
            );
            aggiornato = {
              ...aggiornato,
              storicoInfortuni: [...storicoChiuso, inf],
              infortunio: "",
              tipoInfortunio: undefined,
              inizioRehab: "",
              fineRehab: undefined,
              progresso: 100,
              meccanismo: undefined,
              evento: undefined,
              contatto: undefined,
              lato: undefined,
              posizioneInfortunio: undefined,
              osiicsCodice: undefined,
              osiicsDescrizione: undefined,
              osiicsCodeId: undefined,
            };
            // Rimappa le sessioni orfane __corrente__ al nuovo id storico
            const remappati = programmiAtleta
              .filter((p) => p.infortunioId === "__corrente__")
              .map((p) => ({ ...p, infortunioId: inf.id }));
            if (remappati.length > 0) {
              await Promise.all(remappati.map((p) => upsertProgramma(p)));
              setProgrammiAtleta((prev) =>
                prev.map((p) => p.infortunioId === "__corrente__" ? { ...p, infortunioId: inf.id } : p)
              );
            }
          }
        }
        setAtleti((prev) => prev.map((a) => a.id === editAtleta.id ? aggiornato : a));
        setSelected(aggiornato);
        await upsertAtleta(aggiornato);
        syncInjury(aggiornato);
      } else {
        // Controlla se esiste già un atleta con lo stesso nome (case-insensitive)
        const nomeNorm = dati.nome.trim().toLowerCase();
        const esistente = atleti.find((a) => a.nome.trim().toLowerCase() === nomeNorm);

        if (esistente) {
          const oggi = new Date().toISOString().slice(0, 10);
          let aggiornato: Atleta;

          if (esistente.stato === "Disponibile") {
            // Archivia l'eventuale infortunio precedente
            const storicoEsistente = esistente.storicoInfortuni ?? [];
            const hasPrevInf = !!(esistente.infortunio || esistente.inizioRehab);
            const storicoAggiornato: InfortunioStorico[] = hasPrevInf
              ? [...storicoEsistente, {
                  id: uid(),
                  diagnosi: esistente.infortunio || "—",
                  tipo: esistente.tipoInfortunio,
                  inizioRehab: esistente.inizioRehab || "",
                  fineRehab: esistente.fineRehab || oggi,
                  note: esistente.note || undefined,
                }]
              : storicoEsistente;
            aggiornato = {
              ...esistente,
              stato: "Infortunato",
              infortunio: dati.infortunio ?? "",
              tipoInfortunio: dati.tipoInfortunio,
              osiicsCodeId: dati.osiicsCodeId || undefined,
              osiicsCodice: dati.osiicsCodice || undefined,
              osiicsDescrizione: dati.osiicsDescrizione || undefined,
              evento: dati.evento || undefined,
              meccanismo: dati.meccanismo || undefined,
              contatto: dati.contatto || undefined,
              lato: dati.lato || undefined,
              posizioneInfortunio: dati.posizioneInfortunio || undefined,
              inizioRehab: dati.inizioRehab || oggi,
              fineRehab: undefined,
              progresso: 0,
              progressoManuale: undefined,
              categoria: dati.categoria || esistente.categoria,
              fisioterapista: dati.fisioterapista || esistente.fisioterapista,
              note: dati.note || esistente.note || "",
              storicoInfortuni: storicoAggiornato,
            };
          } else {
            // Atleta già Infortunato: aggiunge come infortunio concorrente
            const nuovoConcorrente: InfortunioStorico = {
              id: uid(),
              diagnosi: dati.infortunio || "—",
              tipo: dati.tipoInfortunio,
              inizioRehab: dati.inizioRehab || oggi,
              fineRehab: "",
              note: dati.note || undefined,
              attivo: true,
              evento: dati.evento ?? undefined,
              meccanismo: dati.meccanismo ?? undefined,
              contatto: dati.contatto ?? undefined,
              lato: dati.lato ?? undefined,
              posizioneInfortunio: dati.posizioneInfortunio ?? undefined,
            };
            aggiornato = {
              ...esistente,
              storicoInfortuni: [...(esistente.storicoInfortuni ?? []), nuovoConcorrente],
            };
          }

          setAtleti((prev) => prev.map((a) => a.id === esistente.id ? aggiornato : a));
          setSelected(aggiornato);
          await upsertAtleta(aggiornato);
          syncInjury(aggiornato);
          if (dettaglio) {
            const det = formToDettaglio(uid(), esistente.id, dettaglio);
            await upsertDettaglioSituazionale(det);
            setDettaglioSituazionale(det);
          }
        } else {
          const nuovo = { ...dati, id: atletaId };
          setAtleti((prev) => [...prev, nuovo]);
          await upsertAtleta(nuovo);
          syncInjury(nuovo);
          if (dettaglio) {
            const det = formToDettaglio(uid(), atletaId, dettaglio);
            await upsertDettaglioSituazionale(det);
            setDettaglioSituazionale(det);
          }
        }
      }
      setMostraForm(false);
    } catch (err: any) {
      alert(`Errore nel salvataggio: ${err.message}`);
    }
  };

  const salvaEditStorico = async () => {
    if (!selected || !editStorico || !editStoricoForm) return;
    const nuovoStorico = (selected.storicoInfortuni ?? []).map((inf, i) =>
      i === editStorico.idx ? editStoricoForm : inf
    );
    const aggiornato = { ...selected, storicoInfortuni: nuovoStorico };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    setEditStorico(null); setEditStoricoForm(null);
    await upsertAtleta(aggiornato);
  };

  const aggiungiInfortBis = async () => {
    if (!selected || !nuovoInfortBis.diagnosi.trim()) return;
    const detForm = nuovoDettaglioRef.current?.hasData() ? nuovoDettaglioRef.current.getValues() : undefined;
    const inf: InfortunioStorico = {
      id: uid(), tipo: nuovoInfortBis.tipo || undefined,
      diagnosi: nuovoInfortBis.diagnosi, inizioRehab: nuovoInfortBis.inizioRehab,
      fineRehab: "", note: nuovoInfortBis.note || undefined, attivo: true,
      evento: nuovoInfortBis.evento || undefined,
      meccanismo: nuovoInfortBis.meccanismo || undefined,
      contatto: nuovoInfortBis.contatto || undefined,
      lato: nuovoInfortBis.lato || undefined,
      posizioneInfortunio: nuovoInfortBis.posizioneInfortunio || undefined,
      osiicsCodice: nuovoInfortBis.osiicsCodice || undefined,
      osiicsDescrizione: nuovoInfortBis.osiicsDescrizione || undefined,
      osiicsCodeId: nuovoInfortBis.osiicsCodeId || undefined,
      ...(detForm ? { dettaglioSituazionale: detForm } : {}),
    };
    const aggiornato = { ...selected, storicoInfortuni: [...(selected.storicoInfortuni ?? []), inf] };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
    setMostraFormInfortBis(false);
    setNuovoInfortBis({ tipo: "", diagnosi: "", inizioRehab: new Date().toISOString().slice(0, 10), note: "", evento: "", meccanismo: "", contatto: "", lato: "", posizioneInfortunio: "", osiicsCodice: "", osiicsDescrizione: "", osiicsCodeId: "" });
  };

  const salvaInfortBisDati = async () => {
    if (!selected || !editDatiConcorrente) return;
    const detForm = editDettaglioRef.current?.hasData() ? editDettaglioRef.current.getValues() : undefined;
    const aggiornato = {
      ...selected,
      storicoInfortuni: (selected.storicoInfortuni ?? []).map((inf) =>
        inf.id === editDatiConcorrente
          ? { ...inf, ...editDatiForm, ...(detForm ? { dettaglioSituazionale: detForm } : {}) }
          : inf
      ),
    };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
    setEditDatiConcorrente(null);
    setEditDatiForm({});
  };

  const salvaReferto = async () => {
    if (!selected || !nuovoReferto.tipo || !nuovoReferto.esito || refertoSaving) return;
    setRefertoSaving(true);
    const referto: RefertoClinico = {
      id: uid(),
      data: nuovoReferto.data,
      tipo: nuovoReferto.tipo as TipoReferto,
      esito: nuovoReferto.esito as EsitoReferto,
      descrizione: nuovoReferto.descrizione || undefined,
      note: nuovoReferto.note || undefined,
    };
    const nuoviReferti = [...(selected.refertiClinici ?? []), referto];
    const aggiornato = { ...selected, refertiClinici: nuoviReferti };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    // Offline-first save (IndexedDB + sync queue)
    await upsertAtleta(aggiornato);
    // Targeted Supabase patch — more reliable than full-row upsert when schema has new columns
    await patchRefertiClinici(selected.id, nuoviReferti);
    setRefertoSaving(false);
    setMostraFormReferto(false);
    setNuovoReferto({ data: new Date().toISOString().slice(0, 10), tipo: "", esito: "", descrizione: "", note: "" });
    setRefertoSalvato(true);
    setTimeout(() => setRefertoSalvato(false), 2000);
  };

  const eliminaReferto = async (id: string) => {
    if (!selected) return;
    const nuoviReferti = (selected.refertiClinici ?? []).filter((r) => r.id !== id);
    const aggiornato = { ...selected, refertiClinici: nuoviReferti };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
    await patchRefertiClinici(selected.id, nuoviReferti);
  };

  const chiudiInfortBis = async (id: string) => {
    if (!selected) return;
    const oggi = new Date().toISOString().slice(0, 10);
    const aggiornato = {
      ...selected,
      storicoInfortuni: (selected.storicoInfortuni ?? []).map((inf) =>
        inf.id === id ? { ...inf, attivo: undefined as unknown as true, fineRehab: inf.fineRehab || oggi } : inf
      ),
    };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
  };

  const fondiAtleta = async (altro: Atleta) => {
    if (!selected) return;
    const nuoviConcorrenti: InfortunioStorico[] = [];
    if ((altro.stato === "Infortunato" || altro.stato === "NTL") && altro.infortunio) {
      nuoviConcorrenti.push({ id: uid(), tipo: altro.tipoInfortunio, diagnosi: altro.infortunio, inizioRehab: altro.inizioRehab || "", fineRehab: "", attivo: true });
    } else if (altro.infortunio) {
      nuoviConcorrenti.push({ id: uid(), tipo: altro.tipoInfortunio, diagnosi: altro.infortunio, inizioRehab: altro.inizioRehab || "", fineRehab: altro.fineRehab || new Date().toISOString().slice(0, 10) });
    }
    const storicoFuso: InfortunioStorico[] = [...(selected.storicoInfortuni ?? []), ...(altro.storicoInfortuni ?? []), ...nuoviConcorrenti];
    const aggiornato = { ...selected, storicoInfortuni: storicoFuso };
    setAtleti((prev) => prev.filter((a) => a.id !== altro.id).map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
    const programmiAltro = await loadProgrammi(altro.id);
    for (const p of programmiAltro) await upsertProgramma({ ...p, atletaId: selected.id });
    await deleteAtleta(altro.id);
    loadProgrammi(selected.id).then(setProgrammiAtleta);
    setMostraFondi(false);
  };

  const ripristinaInfortunio = async (inf: InfortunioStorico, idx: number) => {
    if (!selected) return;
    if (!confirm("Ripristinare questo infortunio come attivo? L'atleta tornerà Infortunato.")) return;
    const nuovoStorico = (selected.storicoInfortuni ?? []).filter((_, i) => i !== idx);
    const aggiornato: Atleta = {
      ...selected,
      stato: "Infortunato",
      infortunio: inf.diagnosi,
      tipoInfortunio: inf.tipo as any,
      inizioRehab: inf.inizioRehab,
      fineRehab: undefined,
      progresso: 0,
      storicoInfortuni: nuovoStorico,
    };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
  };

  const eliminaInfortunioStorico = async (inf: InfortunioStorico) => {
    if (!selected) return;
    if (!confirm(`Eliminare definitivamente "${inf.diagnosi}"? L'operazione non è reversibile.`)) return;
    const nuovoStorico = (selected.storicoInfortuni ?? []).filter((s) => s.id !== inf.id);
    const aggiornato = { ...selected, storicoInfortuni: nuovoStorico };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
  };

  const scaricaPDFStorico = async () => {
    if (!selected) return;
    const programmi = await loadProgrammi(selected.id);
    const det = (selected.stato === "Infortunato" || selected.stato === "NTL") ? (dettaglioSituazionale ?? await loadDettaglioSituazionale(selected.id)) : null;
    await esportaStoricoCompletoPDF(selected, programmi, det);
  };

  const scaricaCSVStorico = async () => {
    if (!selected) return;
    const programmi = await loadProgrammi(selected.id);
    esportaStoricoCompletoCSV(selected, programmi);
  };

  const salvaQuestionnaire = async (questionari: QuestionarioKinesiofobia[]) => {
    if (!selected) return;
    const aggiornato = { ...selected, questionariKinesiofobia: questionari };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
  };

  const elimina = async (id: string) => {
    const atleta = atleti.find((a) => a.id === id);
    if (!atleta) return;

    const hasStorico = (atleta.storicoInfortuni ?? []).filter((i) => !i.attivo).length > 0;

    if ((atleta.stato === "Infortunato" || atleta.stato === "NTL") && hasStorico) {
      // Ha infortuni precedenti archiviati: rimuove solo il corrente e torna Disponibile
      if (!confirm(`Annullare l'infortunio corrente di ${nd(atleta)} e ripristinarlo come Disponibile?\n\nGli infortuni precedenti verranno conservati.`)) return;
      const aggiornato: Atleta = {
        ...atleta,
        stato: "Disponibile",
        infortunio: "",
        tipoInfortunio: undefined,
        inizioRehab: "",
        fineRehab: undefined,
        evento: undefined,
        meccanismo: undefined,
        contatto: undefined,
        lato: undefined,
        posizioneInfortunio: undefined,
        osiicsCodeId: undefined,
        osiicsCodice: undefined,
        osiicsDescrizione: undefined,
        progresso: 100,
        progressoManuale: undefined,
      };
      setAtleti((prev) => prev.map((a) => a.id === id ? aggiornato : a));
      if (selected?.id === id) setSelected(aggiornato);
      await upsertAtleta(aggiornato);
    } else {
      // Nessuno storico archiviato: elimina tutto
      const msg = (atleta.stato === "Infortunato" || atleta.stato === "NTL")
        ? `Eliminare definitivamente ${nd(atleta)}? Nessun infortunio precedente verrà conservato.`
        : `Eliminare ${nd(atleta)}?`;
      if (!confirm(msg)) return;
      setAtleti((prev) => prev.filter((a) => a.id !== id));
      if (selected?.id === id) setSelected(null);
      await deleteAtleta(id);
    }
  };

  const filtered = atleti.filter((a) => {
    const matchSearch =
      nd(a).toLowerCase().includes(search.toLowerCase()) ||
      a.nome.toLowerCase().includes(search.toLowerCase()) ||
      (a.infortunio ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (a.tipoInfortunio ?? "").toLowerCase().includes(search.toLowerCase()) ||
      a.categoria.toLowerCase().includes(search.toLowerCase());
    const matchStato = filtroStato === "Tutti" || a.stato === filtroStato;
    return matchSearch && matchStato;
  });

  const perCategoria: Record<string, Atleta[]> = {};
  CATEGORIE.forEach((cat) => {
    const lista = filtered.filter((a) => a.categoria === cat).sort((a, b) => {
      const statoOrd = (s: string) => s === "Infortunato" ? 0 : s === "NTL" ? 1 : 2;
      const sd = statoOrd(a.stato) - statoOrd(b.stato);
      if (sd !== 0) return sd;
      return nd(a).localeCompare(nd(b), "it");
    });
    if (lista.length > 0) perCategoria[cat] = lista;
  });

  const countPerStato = (s: Stato | "Tutti") => {
    if (s === "Tutti") return atleti.length;
    if (s === "Infortunato") return atleti.filter((a) => a.stato === "Infortunato").length;
    return atleti.filter((a) => a.stato === s).length;
  };

  return (
    <div className="flex h-full">
      {/* Toast globale */}
      {toastMsg && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-2 transition-all ${
            toastMsg.tipo === "ok"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toastMsg.tipo === "ok" ? "✓" : "⚠️"} {toastMsg.text}
        </div>
      )}
      {/* Lista */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Atleti</h1>
            <p className="text-gray-500 mt-1">{atleti.length} atleti nel programma</p>
          </div>
          <button onClick={apriNuovo}
            className="flex items-center gap-2 bg-[#C8102E] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-800">
            <Plus className="w-4 h-4" /> Nuovo Atleta
          </button>
        </div>

        {/* Barra ricerca */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Cerca per nome, infortunio o categoria..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
          />
        </div>

        {/* Filtro per stato */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {FILTRI_STATO.map(({ label, value }) => {
            const count = countPerStato(value);
            return (
              <button key={value} onClick={() => setFiltroStato(value)}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filtroStato === value
                    ? "bg-[#C8102E] text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
                }`}>
                {label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  filtroStato === value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <User className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 text-lg font-medium">
              {atleti.length === 0 ? "Nessun atleta ancora" : "Nessun risultato"}
            </p>
            <p className="text-gray-300 text-sm mt-1">
              {atleti.length === 0 ? "Clicca \"Nuovo Atleta\" per aggiungerne uno" : "Prova a modificare i filtri di ricerca"}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(perCategoria).map(([cat, lista]) => (
              <div key={cat}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-bold text-[#C8102E] uppercase tracking-widest">{cat}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {lista.reduce((s, a) => s + 1 + (a.storicoInfortuni ?? []).filter(i => i.attivo).length, 0)}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="space-y-3">
                  {lista.flatMap((atleta) => {
                    const concorrenti = (atleta.storicoInfortuni ?? []).filter(inf => inf.attivo === true);
                    const cards = [
                      { infortunio: atleta.infortunio, tipo: atleta.tipoInfortunio, cardKey: atleta.id },
                      ...concorrenti.map(inf => ({ infortunio: inf.diagnosi, tipo: inf.tipo, cardKey: `${atleta.id}-${inf.id}` })),
                    ];
                    return cards.map(({ infortunio, tipo, cardKey }) => (
                      <div key={cardKey} className="group flex items-center gap-2">
                      <button onClick={() => { setSelected(atleta); setTab("dati"); }}
                        className={`flex-1 min-w-0 bg-white rounded-xl p-4 border text-left transition-all hover:shadow-md ${
                          selected?.id === atleta.id ? "border-[#C8102E] shadow-md" : "border-gray-100"
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                            atleta.stato === "Disponibile" ? "bg-gray-300" : atleta.stato === "NTL" ? "bg-amber-400" : "bg-[#2B2B2B]"
                          }`}>
                            {nd(atleta).trim().split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>(w[0]??"").toUpperCase()).join("")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className={`font-semibold truncate ${atleta.stato === "Disponibile" ? "text-gray-500" : "text-gray-900"}`}>{nd(atleta)}</p>
                              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statoColor[atleta.stato]}`}>
                                {atleta.stato}
                              </span>
                            </div>
                            {infortunio && <p className="text-xs text-gray-500 truncate font-medium">{infortunio}</p>}
                            <p className="text-xs text-gray-300 truncate mt-0.5">
                              {[atleta.posizione, tipo].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center">
                            <ChevronRight className="w-4 h-4 text-gray-200" />
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); elimina(atleta.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500"
                        title="Elimina atleta">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      </div>
                    ));
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pannello dettaglio */}
      {selected && !mostraForm && (
        <div className="w-96 bg-white border-l border-gray-100 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-start justify-between mb-3">
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              <div className="flex gap-2">
                <button onClick={() => apriModifica(selected)}
                  className="text-xs px-3 py-1.5 border border-[#C8102E] text-[#C8102E] rounded-lg hover:bg-red-50 font-medium">
                  Modifica
                </button>
                <button onClick={() => elimina(selected.id)}
                  className="text-xs px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg hover:text-red-400 hover:border-red-200">
                  Elimina
                </button>
              </div>
            </div>

            <div className="text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-2 ${
                selected.stato === "Disponibile" ? "bg-gray-400" : selected.stato === "NTL" ? "bg-amber-400" : "bg-[#2B2B2B]"
              }`}>
                {nd(selected).trim().split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>(w[0]??"").toUpperCase()).join("")}
              </div>
              <h2 className="font-bold text-gray-900 text-lg">{nd(selected)}</h2>
              <p className="text-sm text-gray-500">{selected.posizione} · {selected.categoria}</p>
              <span className={`text-xs px-3 py-1 rounded-full font-medium mt-1 inline-block ${statoColor[selected.stato]}`}>
                {selected.stato}
              </span>
            </div>

            {selected.stato === "Disponibile" && (
              <button onClick={() => apriNuovoInfortunio(selected)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-orange-500 text-white py-2 rounded-xl text-xs font-semibold hover:bg-orange-600 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Nuovo infortunio
              </button>
            )}

            {/* Banner atleti duplicati */}
            {(() => {
              const duplicati = atleti.filter((a) => a.id !== selected.id && nd(a).toLowerCase() === nd(selected).toLowerCase());
              if (!duplicati.length) return null;
              return (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    {duplicati.length === 1 ? "Esiste un altro record con lo stesso nome" : `Esistono altri ${duplicati.length} record con lo stesso nome`}
                  </p>
                  {!mostraFondi ? (
                    <button onClick={() => setMostraFondi(true)} className="text-xs font-semibold text-amber-700 underline">
                      Fondi i record duplicati
                    </button>
                  ) : (
                    <div className="space-y-2 mt-1">
                      <p className="text-[11px] text-amber-600">L&apos;infortunio del duplicato verrà aggiunto come concorrente. Il record duplicato sarà eliminato.</p>
                      {duplicati.map((altro) => (
                        <div key={altro.id} className="bg-white border border-amber-200 rounded-lg p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{altro.infortunio || "—"}</p>
                            <p className="text-[11px] text-gray-400">{altro.tipoInfortunio || altro.stato}</p>
                          </div>
                          <button onClick={() => { if (confirm(`Fondi "${altro.infortunio || altro.stato}" in questo atleta ed elimina il duplicato?`)) fondiAtleta(altro); }}
                            className="shrink-0 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 px-2 py-1 rounded-lg">
                            Fondi
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setMostraFondi(false)} className="text-[11px] text-gray-400">Annulla</button>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex mt-3 bg-gray-100 rounded-xl p-1">
              {(["dati", "cartella", "storia"] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                  }`}>
                  {t === "dati" ? "Dati" : t === "cartella" ? "Cartella" : "Storico"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "dati" ? (
              <div className="space-y-2.5 text-sm">
                {/* ── Sezione infortunio principale ── */}
                {(() => {
                  const concorrenti = (selected.storicoInfortuni ?? []).filter((i) => i.attivo === true);
                  return concorrenti.length > 0 ? (
                    <div className="flex items-center gap-2 pb-0.5">
                      <p className="text-[10px] font-bold text-[#C8102E] uppercase tracking-widest">Infortunio principale</p>
                      <div className="flex-1 h-px bg-red-100" />
                    </div>
                  ) : null;
                })()}

                {[
                  ["Piede dominante", selected.piedeDominante || "—"],
                  ["Diagnosi / Infortunio", selected.infortunio || "—"],
                  ["Inizio riabilitazione", selected.inizioRehab ? new Date(selected.inizioRehab + "T12:00").toLocaleDateString("it-IT") : "—"],
                  ...(selected.fineRehab ? [["Fine riabilitazione", new Date(selected.fineRehab + "T12:00").toLocaleDateString("it-IT")]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-medium text-gray-900">{value}</p>
                  </div>
                ))}

                {(selected.osiicsCodice || selected.osiicsDescrizione) && (
                  <div className="pt-1 border-t border-blue-100">
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Classificazione OSIICS</p>
                    <div className="bg-blue-50 rounded-xl p-3 flex items-start gap-3">
                      {selected.osiicsCodice && (
                        <span className="font-mono font-bold text-base text-blue-700 shrink-0 bg-blue-100 px-2 py-1 rounded-lg">{selected.osiicsCodice}</span>
                      )}
                      <p className="font-medium text-blue-900 text-sm mt-1">{selected.osiicsDescrizione || "—"}</p>
                    </div>
                  </div>
                )}

                {(selected.tipoInfortunio || selected.evento || selected.meccanismo || selected.contatto || selected.lato || selected.posizioneInfortunio) && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Dettaglio infortunio</p>
                    <div className="space-y-2">
                      {[
                        ["Tipologia", selected.tipoInfortunio],
                        ["Evento", selected.evento],
                        ["Meccanismo", selected.meccanismo],
                        ["Contatto", selected.contatto],
                        ["Lato", selected.lato],
                        ["Posizione", selected.posizioneInfortunio],
                      ].filter(([, v]) => !!v).map(([label, value]) => (
                        <div key={label} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className="font-medium text-gray-900">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dettaglio situazionale FIICCS */}
                {(selected.stato === "Infortunato" || selected.stato === "NTL") && (
                  <div className="pt-1 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dettaglio situazionale</p>
                      <button
                        type="button"
                        onClick={() => { setEditDettaglioAperto((v) => !v); showToast("Form aperto v3 — pronto per salvare", "ok"); }}
                        className="text-xs font-semibold text-[#C8102E] hover:underline flex items-center gap-0.5"
                      >
                        <Pencil className="w-3 h-3" />
                        {dettaglioSituazionale ? "Modifica" : "Aggiungi"}
                      </button>
                    </div>

                    {editDettaglioAperto && (
                      <div className="mb-3 space-y-2">
                        <DettaglioSituazionale
                          ref={inlineDettaglioRef}
                          contatto={selected.contatto}
                          initialValues={dettaglioSituazionale ? dettaglioToForm(dettaglioSituazionale) : undefined}
                        />
                        <div className="space-y-2 pt-1">
                          {dettaglioErrMsg && (
                            <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                              ⚠️ Errore nel salvataggio: {dettaglioErrMsg}
                            </p>
                          )}
                          {dettaglioSalvatoOk && (
                            <p className="text-xs text-green-700 font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                              ✓ Salvato con successo!
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button
                              disabled={salvandoDettaglio}
                              type="button"
                              onClick={async () => {
                                if (!selected) return;
                                setSalvandoDettaglio(true);
                                setDettaglioErrMsg(null);
                                setDettaglioSalvatoOk(false);
                                try {
                                  const vals = inlineDettaglioRef.current?.getValues();
                                  if (!vals) {
                                    const msg = "Impossibile leggere i dati del form";
                                    setDettaglioErrMsg(msg);
                                    showToast(msg, "err");
                                    return;
                                  }
                                  const det = formToDettaglio(dettaglioSituazionale?.id ?? uid(), selected.id, vals);
                                  const res = await upsertDettaglioSituazionale(det);
                                  if (!res.ok) {
                                    const msg = res.error ?? "Errore sconosciuto";
                                    setDettaglioErrMsg(msg);
                                    showToast("Errore: " + msg, "err");
                                    return;
                                  }
                                  setDettaglioSituazionale(det);
                                  setDettaglioSalvatoOk(true);
                                  showToast("Dettaglio salvato!", "ok");
                                  setTimeout(() => {
                                    setTuttiDettagli((prev) => ({ ...prev, [selected.id]: det }));
                                    setEditDettaglioAperto(false);
                                    setDettaglioSalvatoOk(false);
                                  }, 1500);
                                } finally {
                                  setSalvandoDettaglio(false);
                                }
                              }}
                              className="flex-1 bg-[#C8102E] text-white text-xs font-semibold py-2 rounded-xl hover:bg-red-800 disabled:opacity-60"
                            >
                              {salvandoDettaglio ? "Salvataggio…" : "Salva dettaglio"}
                            </button>
                            <button
                              onClick={() => { setEditDettaglioAperto(false); setDettaglioErrMsg(null); setDettaglioSalvatoOk(false); }}
                              className="px-4 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {!editDettaglioAperto && dettaglioSituazionale && (
                      <div className="space-y-2">
                        {[
                          dettaglioSituazionale.fonteInformazione?.length && ["Fonte", dettaglioSituazionale.fonteInformazione.join(", ") + (dettaglioSituazionale.fonteInformazioneAltro ? ` — ${dettaglioSituazionale.fonteInformazioneAltro}` : "")],
                          dettaglioSituazionale.giorniReferto != null && ["Giorni a referto", String(dettaglioSituazionale.giorniReferto)],
                          dettaglioSituazionale.modalitaInsorgenza && ["Insorgenza", dettaglioSituazionale.modalitaInsorgenza + (dettaglioSituazionale.modalitaInsorgenzaAltro ? ` — ${dettaglioSituazionale.modalitaInsorgenzaAltro}` : "")],
                          dettaglioSituazionale.attivitaFisica && ["Attività fisica", dettaglioSituazionale.attivitaFisica],
                          dettaglioSituazionale.tipoCorsa && ["Tipo corsa", dettaglioSituazionale.tipoCorsa],
                          dettaglioSituazionale.corsaGradi && ["Gradi cambio dir.", dettaglioSituazionale.corsaGradi],
                          dettaglioSituazionale.corsaGambaCoinvolta && ["Gamba coinvolta", dettaglioSituazionale.corsaGambaCoinvolta],
                          dettaglioSituazionale.saltoFase && ["Fase salto", dettaglioSituazionale.saltoFase],
                          dettaglioSituazionale.saltoAtterraggioDove && ["Atterraggio dove", dettaglioSituazionale.saltoAtterraggioDove],
                          dettaglioSituazionale.saltoGambaAtterraggio && ["Gamba atterraggio", dettaglioSituazionale.saltoGambaAtterraggio],
                          dettaglioSituazionale.cadutaDettagli && ["Caduta", dettaglioSituazionale.cadutaDettagli],
                          dettaglioSituazionale.contattoDettaglio && ["Tipo contatto", dettaglioSituazionale.contattoDettaglio],
                          dettaglioSituazionale.situazioneDuello && ["Duello", dettaglioSituazionale.situazioneDuello],
                          dettaglioSituazionale.direzioneContrasto && ["Direzione contrasto", dettaglioSituazionale.direzioneContrasto],
                          dettaglioSituazionale.collisioneCon && ["Collisione con", dettaglioSituazionale.collisioneCon],
                          dettaglioSituazionale.duelloAereo != null && ["Duello aereo", dettaglioSituazionale.duelloAereo ? "Sì" : "No"],
                          dettaglioSituazionale.azioneConPalla && ["Azione con palla", "Sì"],
                          dettaglioSituazionale.situazioneGiocoPalla && ["Situazione gioco", dettaglioSituazionale.situazioneGiocoPalla],
                          dettaglioSituazionale.attivitaConPalla && ["Attività con palla", dettaglioSituazionale.attivitaConPalla],
                          dettaglioSituazionale.calcioAzione && ["Azione calcio", dettaglioSituazionale.calcioAzione],
                          dettaglioSituazionale.calcioIntensita && ["Intensità calcio", dettaglioSituazionale.calcioIntensita],
                          dettaglioSituazionale.calcioTipo && ["Tipo calcio", dettaglioSituazionale.calcioTipo],
                          dettaglioSituazionale.calcioFase && ["Fase calcio", dettaglioSituazionale.calcioFase],
                          dettaglioSituazionale.dribblingTipo && ["Dribbling", dettaglioSituazionale.dribblingTipo],
                          dettaglioSituazionale.pallaAltezza && ["Altezza palla", dettaglioSituazionale.pallaAltezza],
                          dettaglioSituazionale.controlloPallaCon && ["Controllo con", dettaglioSituazionale.controlloPallaCon],
                          dettaglioSituazionale.gambaInfortunataPalla && ["Gamba infort. a contatto", dettaglioSituazionale.gambaInfortunataPalla],
                          dettaglioSituazionale.tipoSeduta && ["Tipo seduta", dettaglioSituazionale.tipoSeduta + (dettaglioSituazionale.tipoEsercitazione ? ` — ${dettaglioSituazionale.tipoEsercitazione}` : "")],
                          dettaglioSituazionale.partitaSede && ["Sede partita", dettaglioSituazionale.partitaSede],
                          dettaglioSituazionale.partitaCompetizione && ["Competizione", dettaglioSituazionale.partitaCompetizione],
                          dettaglioSituazionale.partitaPunteggio && ["Punteggio", dettaglioSituazionale.partitaPunteggio],
                          dettaglioSituazionale.faseGioco && ["Fase di gioco", dettaglioSituazionale.faseGioco],
                          dettaglioSituazionale.sottoFaseGioco && ["Sotto-fase", dettaglioSituazionale.sottoFaseGioco],
                          dettaglioSituazionale.terrenoGioco && ["Terreno", dettaglioSituazionale.terrenoGioco],
                          dettaglioSituazionale.decisioneArbitrale && ["Decisione arbitrale", dettaglioSituazionale.decisioneArbitrale],
                          dettaglioSituazionale.minutoInfortunio != null && ["Minuto infortunio", `${dettaglioSituazionale.minutoInfortunio}'`],
                          dettaglioSituazionale.minutiGiocatiPrima != null && ["Minuti giocati prima", `${dettaglioSituazionale.minutiGiocatiPrima}'`],
                        ].filter((item): item is [string, string] => Array.isArray(item)).map(([label, value]) => (
                          <div key={label as string} className="bg-blue-50 rounded-xl p-3">
                            <p className="text-xs text-blue-400">{label as string}</p>
                            <p className="font-medium text-blue-900 text-sm">{value as string}</p>
                          </div>
                        ))}
                        {/* Fallback: record esiste ma tutti i campi sono vuoti */}
                        {[
                          dettaglioSituazionale.fonteInformazione,
                          dettaglioSituazionale.modalitaInsorgenza,
                          dettaglioSituazionale.attivitaFisica,
                          dettaglioSituazionale.tipoSeduta,
                          dettaglioSituazionale.giorniReferto,
                        ].every((v) => !v) && (
                          <p className="text-xs text-gray-400 italic py-1">Dettaglio inserito — campi principali non compilati</p>
                        )}
                      </div>
                    )}

                    {!editDettaglioAperto && !dettaglioSituazionale && dbTableReady === false && (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-amber-700">Tabella DB mancante</p>
                        <p className="text-xs text-amber-700">La tabella <code className="bg-amber-100 px-1 rounded">dettaglio_situazionale</code> non esiste ancora nel database Supabase. Devi crearla una volta sola con il seguente SQL.</p>
                        <p className="text-xs text-amber-600 font-semibold">1. Vai su <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline">supabase.com/dashboard</a> → SQL Editor</p>
                        <p className="text-xs text-amber-600 font-semibold">2. Copia e incolla questo SQL, poi clicca Run:</p>
                        <pre className="text-[10px] bg-white border border-amber-200 rounded p-2 overflow-x-auto text-gray-700 leading-tight">{`create table if not exists dettaglio_situazionale (
  id text primary key,
  atleta_id text references atleti(id) on delete cascade,
  fonte_informazione text[], fonte_informazione_altro text,
  giorni_referto integer, modalita_insorgenza text,
  modalita_insorgenza_altro text, contatto_dettaglio text,
  situazione_duello text, direzione_contrasto text,
  collisione_con text, duello_aereo boolean,
  attivita_fisica text, tipo_corsa text, corsa_gradi text,
  corsa_gamba_coinvolta text, salto_fase text,
  salto_atterraggio_dove text, salto_gamba_atterraggio text,
  caduta_dettagli text, azione_con_palla boolean,
  situazione_gioco_palla text, attivita_con_palla text,
  calcio_azione text, calcio_intensita text, calcio_tipo text,
  calcio_fase text, dribbling_tipo text, palla_altezza text,
  controllo_palla_con text, gamba_infortunata_palla text,
  tipo_seduta text, tipo_esercitazione text, partita_sede text,
  partita_competizione text, partita_punteggio text,
  fase_gioco text, sotto_fase_gioco text, terreno_gioco text,
  decisione_arbitrale text, minuto_infortunio integer,
  minuti_giocati_prima integer, created_at timestamptz default now()
);
alter table dettaglio_situazionale enable row level security;
create policy "Solo autenticati dettaglio_situazionale"
  on dettaglio_situazionale for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);`}</pre>
                        <button
                          onClick={() => {
                            const sql = `create table if not exists dettaglio_situazionale (\n  id text primary key,\n  atleta_id text references atleti(id) on delete cascade,\n  fonte_informazione text[], fonte_informazione_altro text,\n  giorni_referto integer, modalita_insorgenza text,\n  modalita_insorgenza_altro text, contatto_dettaglio text,\n  situazione_duello text, direzione_contrasto text,\n  collisione_con text, duello_aereo boolean,\n  attivita_fisica text, tipo_corsa text, corsa_gradi text,\n  corsa_gamba_coinvolta text, salto_fase text,\n  salto_atterraggio_dove text, salto_gamba_atterraggio text,\n  caduta_dettagli text, azione_con_palla boolean,\n  situazione_gioco_palla text, attivita_con_palla text,\n  calcio_azione text, calcio_intensita text, calcio_tipo text,\n  calcio_fase text, dribbling_tipo text, palla_altezza text,\n  controllo_palla_con text, gamba_infortunata_palla text,\n  tipo_seduta text, tipo_esercitazione text, partita_sede text,\n  partita_competizione text, partita_punteggio text,\n  fase_gioco text, sotto_fase_gioco text, terreno_gioco text,\n  decisione_arbitrale text, minuto_infortunio integer,\n  minuti_giocati_prima integer, created_at timestamptz default now()\n);\nalter table dettaglio_situazionale enable row level security;\ncreate policy "Solo autenticati dettaglio_situazionale"\n  on dettaglio_situazionale for all\n  using (auth.uid() is not null)\n  with check (auth.uid() is not null);`;
                            navigator.clipboard.writeText(sql).then(() => { setSqlCopiato(true); setTimeout(() => setSqlCopiato(false), 2000); });
                          }}
                          className="w-full text-xs font-semibold py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 flex items-center justify-center gap-1"
                        >
                          {sqlCopiato ? <><Check className="w-3 h-3" /> Copiato!</> : <><Copy className="w-3 h-3" /> Copia SQL</>}
                        </button>
                        <p className="text-xs text-amber-500 text-center">Dopo aver eseguito lo SQL, ricarica la pagina</p>
                      </div>
                    )}

                    {!editDettaglioAperto && !dettaglioSituazionale && dbTableReady !== false && (
                      <p className="text-xs text-gray-400 italic py-2">Nessun dettaglio situazionale inserito</p>
                    )}
                  </div>
                )}

                {selected.note && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Note</p>
                    <p className="text-gray-700">{selected.note}</p>
                  </div>
                )}

                {/* ── Infortuni concorrenti (dati clinici) ── */}
                {(selected.storicoInfortuni ?? []).filter((i) => i.attivo === true).map((inf) => (
                  <div key={inf.id} className="pt-2 border-t-2 border-orange-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Infortunio concorrente</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold">In corso</span>
                      </div>
                      {editDatiConcorrente !== inf.id && (
                        <button
                          onClick={() => { setEditDatiConcorrente(inf.id); setEditDatiForm({ tipo: inf.tipo, evento: inf.evento, meccanismo: inf.meccanismo, contatto: inf.contatto, lato: inf.lato, posizioneInfortunio: inf.posizioneInfortunio, osiicsCodice: inf.osiicsCodice, osiicsDescrizione: inf.osiicsDescrizione, osiicsCodeId: inf.osiicsCodeId, note: inf.note }); }}
                          className="text-[10px] font-semibold text-[#C8102E] flex items-center gap-0.5 hover:underline"
                        >
                          <Pencil className="w-3 h-3" /> Modifica
                        </button>
                      )}
                    </div>
                    {editDatiConcorrente === inf.id ? (
                      <div className="border border-orange-200 rounded-2xl p-4 space-y-2 bg-orange-50">
                        <p className="text-xs font-semibold text-orange-700">{inf.diagnosi}</p>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Tipologia</p>
                          <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                            value={editDatiForm.tipo ?? ""} onChange={(e) => setEditDatiForm({ ...editDatiForm, tipo: e.target.value || undefined })}>
                            <option value="">—</option>
                            {TIPI_INFORTUNIO.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Evento</p>
                          <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                            value={editDatiForm.evento ?? ""} onChange={(e) => setEditDatiForm({ ...editDatiForm, evento: e.target.value || undefined })}>
                            <option value="">—</option>
                            {EVENTI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Meccanismo</p>
                          <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                            value={editDatiForm.meccanismo ?? ""} onChange={(e) => setEditDatiForm({ ...editDatiForm, meccanismo: e.target.value || undefined })}>
                            <option value="">—</option>
                            {MECCANISMI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Contatto</p>
                          <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                            value={editDatiForm.contatto ?? ""} onChange={(e) => setEditDatiForm({ ...editDatiForm, contatto: e.target.value || undefined })}>
                            <option value="">—</option>
                            {CONTATTI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Lato</p>
                          <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                            value={editDatiForm.lato ?? ""} onChange={(e) => setEditDatiForm({ ...editDatiForm, lato: e.target.value || undefined })}>
                            <option value="">—</option>
                            {LATI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Posizione</p>
                          <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                            value={editDatiForm.posizioneInfortunio ?? ""} onChange={(e) => setEditDatiForm({ ...editDatiForm, posizioneInfortunio: e.target.value || undefined })}>
                            <option value="">—</option>
                            {POSIZIONI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Classificazione OSIICS</p>
                          <OsiicsCombobox
                            value={editDatiForm.osiicsCodeId ? { id: editDatiForm.osiicsCodeId, codice: editDatiForm.osiicsCodice ?? "", descrizioneIta: editDatiForm.osiicsDescrizione ?? "" } : null}
                            onChange={(code: OsiicsCode | null) => {
                              if (code) setEditDatiForm({ ...editDatiForm, osiicsCodeId: code.id, osiicsCodice: code.codice, osiicsDescrizione: code.descrizioneIta });
                              else setEditDatiForm({ ...editDatiForm, osiicsCodeId: undefined, osiicsCodice: undefined, osiicsDescrizione: undefined });
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Note</p>
                          <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                            value={editDatiForm.note ?? ""} onChange={(e) => setEditDatiForm({ ...editDatiForm, note: e.target.value || undefined })} />
                        </div>
                        <DettaglioSituazionale
                          ref={editDettaglioRef}
                          contatto={editDatiForm.contatto}
                          initialValues={inf.dettaglioSituazionale}
                        />
                        <div className="flex gap-2 pt-1">
                          <button onClick={salvaInfortBisDati} className="flex-1 bg-[#C8102E] text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-800">Salva</button>
                          <button onClick={() => { setEditDatiConcorrente(null); setEditDatiForm({}); }} className="flex-1 border border-gray-200 text-gray-500 text-xs font-semibold py-1.5 rounded-lg hover:bg-white">Annulla</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {[
                          ["Diagnosi", inf.diagnosi],
                          ["Inizio", inf.inizioRehab ? new Date(inf.inizioRehab + "T12:00").toLocaleDateString("it-IT") : "—"],
                          inf.tipo ? ["Tipologia", inf.tipo] : null,
                          inf.evento ? ["Evento", inf.evento] : null,
                          inf.meccanismo ? ["Meccanismo", inf.meccanismo] : null,
                          inf.contatto ? ["Contatto", inf.contatto] : null,
                          inf.lato ? ["Lato", inf.lato] : null,
                          inf.posizioneInfortunio ? ["Posizione", inf.posizioneInfortunio] : null,
                        ].filter((r): r is [string, string] => r !== null).map(([label, value]) => (
                          <div key={label} className="bg-orange-50 rounded-xl p-3">
                            <p className="text-xs text-orange-400">{label}</p>
                            <p className="font-medium text-orange-900">{value}</p>
                          </div>
                        ))}
                        {(inf.osiicsCodice || inf.osiicsDescrizione) && (
                          <div className="bg-blue-50 rounded-xl p-3 flex items-start gap-3">
                            {inf.osiicsCodice && (
                              <span className="font-mono font-bold text-base text-blue-700 shrink-0 bg-blue-100 px-2 py-1 rounded-lg">{inf.osiicsCodice}</span>
                            )}
                            <p className="font-medium text-blue-900 text-sm mt-1">{inf.osiicsDescrizione || "—"}</p>
                          </div>
                        )}
                        {inf.note && (
                          <div className="bg-orange-50 rounded-xl p-3">
                            <p className="text-xs text-orange-400">Note</p>
                            <p className="text-orange-900">{inf.note}</p>
                          </div>
                        )}
                        {!inf.tipo && !inf.evento && !inf.meccanismo && !inf.contatto && !inf.lato && !inf.posizioneInfortunio && !inf.note && !inf.osiicsCodice && !inf.dettaglioSituazionale && (
                          <p className="text-xs text-gray-400 italic">Nessun dettaglio clinico inserito</p>
                        )}
                        {inf.dettaglioSituazionale && (() => {
                          const d = inf.dettaglioSituazionale!;
                          const righe: [string, string][] = ([
                            d.fonte_informazione?.length ? ["Fonte", d.fonte_informazione.join(", ")] : null,
                            d.giorni_referto ? ["Giorni a referto", d.giorni_referto] : null,
                            d.modalita_insorgenza ? ["Insorgenza", d.modalita_insorgenza + (d.modalita_insorgenza_altro ? ` — ${d.modalita_insorgenza_altro}` : "")] : null,
                            d.attivita_fisica ? ["Attività fisica", d.attivita_fisica] : null,
                            d.tipo_corsa ? ["Tipo corsa", d.tipo_corsa] : null,
                            d.salto_fase ? ["Fase salto", d.salto_fase] : null,
                            d.contatto_dettaglio ? ["Tipo contatto", d.contatto_dettaglio] : null,
                            d.direzione_contrasto ? ["Direzione contrasto", d.direzione_contrasto] : null,
                            d.attivita_con_palla ? ["Azione con palla", d.attivita_con_palla] : null,
                            d.tipo_seduta ? ["Tipo seduta", d.tipo_seduta + (d.tipo_esercitazione ? ` — ${d.tipo_esercitazione}` : "")] : null,
                            d.partita_competizione ? ["Competizione", d.partita_competizione] : null,
                            d.fase_gioco ? ["Fase di gioco", d.fase_gioco] : null,
                            d.minuto_infortunio ? ["Minuto", `${d.minuto_infortunio}'`] : null,
                            d.terreno_gioco ? ["Terreno", d.terreno_gioco] : null,
                          ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null);
                          if (!righe.length) return null;
                          return (
                            <div className="pt-2 border-t border-orange-100 space-y-1.5">
                              <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Dettaglio situazionale</p>
                              {righe.map(([label, value]) => (
                                <div key={label} className="bg-orange-50 rounded-xl p-2.5">
                                  <p className="text-xs text-orange-400">{label}</p>
                                  <p className="font-medium text-orange-900 text-sm">{value}</p>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}


                {(selected.telefono || selected.email) && (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs text-gray-400">Contatti</p>
                    {selected.telefono && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />{selected.telefono}
                      </div>
                    )}
                    {selected.email && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />{selected.email}
                      </div>
                    )}
                  </div>
                )}

                {(selected.peso || selected.altezza || selected.plicometrieMedie || selected.altezzaDaSeduto) && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Dati antropometrici</p>
                    <div className="grid grid-cols-3 gap-2">
                      {selected.peso && (
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-400">Peso</p>
                          <p className="font-semibold text-gray-900">{selected.peso} kg</p>
                        </div>
                      )}
                      {selected.altezza && (
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-400">Altezza</p>
                          <p className="font-semibold text-gray-900">{selected.altezza} cm</p>
                        </div>
                      )}
                      {selected.plicometrieMedie && (
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-400">Plicometria media</p>
                          <p className="font-semibold text-gray-900">{selected.plicometrieMedie} mm</p>
                        </div>
                      )}
                    </div>
                    {selected.altezzaDaSeduto && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-400">Altezza da seduto</p>
                          <p className="font-semibold text-gray-900">{selected.altezzaDaSeduto} cm</p>
                        </div>
                        {selected.peso && selected.altezza && selected.dataNascita && (() => {
                          const eta = (Date.now() - new Date(selected.dataNascita + "T12:00").getTime()) / (365.25 * 24 * 3600 * 1000);
                          if (eta <= 0 || eta > 20) return null;
                          const gambe = parseFloat(selected.altezza) - parseFloat(selected.altezzaDaSeduto!);
                          const sit = parseFloat(selected.altezzaDaSeduto!);
                          const offset = -9.236
                            + 0.0002708 * (gambe * sit)
                            - 0.001663  * (eta * gambe)
                            + 0.007216  * (eta * sit)
                            + 0.02292   * (parseFloat(selected.peso) / parseFloat(selected.altezza) * 100);
                          const etaPHV = eta - offset;
                          return (
                            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                              <p className="text-xs text-purple-400">PHV stimato</p>
                              <p className="font-bold text-purple-700">{etaPHV.toFixed(1)} anni</p>
                              <p className="text-[10px] text-purple-400">{offset >= 0 ? "+" : ""}{offset.toFixed(2)} anni da PHV</p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : tab === "cartella" ? (
              <div className="space-y-5">
                {/* ── Questionari RTS (link Office Forms) ── */}
                {(() => {
                  const RTS_LINKS = [
                    {
                      label: "TSK",
                      url: "https://forms.office.com/Pages/ResponsePage.aspx?id=CREOqWwXdkiWTKzKjAALjNSS0wTFlW1DpdKz-oP2BAVUMTNNNlNYM0RJUE44RVZQMEgyQkJBVk5YTy4u",
                    },
                    {
                      label: "AFAQ",
                      url: "https://forms.office.com/pages/responsepage.aspx?id=CREOqWwXdkiWTKzKjAALjNSS0wTFlW1DpdKz-oP2BAVUOE8yTDdPMkpLNUdLTTlQQkVMTFQwTzlaMC4u&route=shorturl",
                    },
                  ] as const;

                  const infortuniOpts = [
                    ...((selected.stato === "Infortunato" || selected.stato === "NTL") && (selected.infortunio || selected.inizioRehab) ? [{
                      id: "__corrente__",
                      label: `In corso: ${selected.infortunio || "—"}`,
                    }] : []),
                    ...[...(selected.storicoInfortuni ?? [])].reverse().map((inf) => ({
                      id: inf.id,
                      label: `${inf.diagnosi}${inf.tipo ? ` (${inf.tipo})` : ""}`,
                    })),
                  ];

                  const punteggioSalva = async () => {
                    const pTSK = nuovoPunteggioTSK !== "" ? parseInt(nuovoPunteggioTSK, 10) : null;
                    const pAFAQ = nuovoPunteggioAFAQ !== "" ? parseInt(nuovoPunteggioAFAQ, 10) : null;
                    if (!nuovaDataRTS || (pTSK === null && pAFAQ === null)) return;
                    const nuovi: QuestionarioKinesiofobia[] = [];
                    if (pTSK !== null && !isNaN(pTSK))
                      nuovi.push({ id: uid(), data: nuovaDataRTS, risposte: [], punteggio: pTSK, tipoTest: "TSK", infortunioId: nuovoInfRTS || undefined });
                    if (pAFAQ !== null && !isNaN(pAFAQ))
                      nuovi.push({ id: uid(), data: nuovaDataRTS, risposte: [], punteggio: pAFAQ, tipoTest: "AFAQ", infortunioId: nuovoInfRTS || undefined });
                    const aggiornati = [...(selected.questionariKinesiofobia ?? []), ...nuovi];
                    await salvaQuestionnaire(aggiornati);
                    setNuovoPunteggioTSK("");
                    setNuovoPunteggioAFAQ("");
                    setNuovaDataRTS(new Date().toISOString().split("T")[0]);
                    setMostraPunteggioRTS(false);
                  };

                  const eliminaPunteggio = async (id: string) => {
                    const aggiornati = (selected.questionariKinesiofobia ?? []).filter((q) => q.id !== id);
                    await salvaQuestionnaire(aggiornati);
                  };

                  const copia = (idx: 1 | 2, url: string) => {
                    navigator.clipboard.writeText(url);
                    setCopiatoLink(idx);
                    setTimeout(() => setCopiatoLink(null), 2000);
                  };

                  return (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Questionari RTS</p>
                      {RTS_LINKS.map((lnk, i) => (
                        <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-700">{lnk.label}</p>
                          <p className="text-[11px] text-gray-400 break-all leading-relaxed">{lnk.url}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => copia((i + 1) as 1 | 2, lnk.url)}
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              {copiatoLink === i + 1 ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiatoLink === i + 1 ? "Copiato!" : "Copia link"}
                            </button>
                            <a
                              href={lnk.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#C8102E] text-white hover:bg-[#a50d26] transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Apri form
                            </a>
                          </div>
                        </div>
                      ))}

                      {/* Punteggi RTS — form aggiunta */}
                      {mostraPunteggioRTS && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-600">Aggiungi punteggio RTS</p>
                          <input type="date" value={nuovaDataRTS} onChange={(e) => setNuovaDataRTS(e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide w-10">TSK</span>
                              <input type="number" min={10} max={40} placeholder="10–40"
                                value={nuovoPunteggioTSK} onChange={(e) => setNuovoPunteggioTSK(e.target.value)}
                                className="flex-1 text-xs bg-transparent outline-none" />
                            </div>
                            <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide w-10">AFAQ</span>
                              <input type="number" min={8} max={42} placeholder="8–42"
                                value={nuovoPunteggioAFAQ} onChange={(e) => setNuovoPunteggioAFAQ(e.target.value)}
                                className="flex-1 text-xs bg-transparent outline-none" />
                            </div>
                          </div>
                          {infortuniOpts.length > 0 && (
                            <select value={nuovoInfRTS} onChange={(e) => setNuovoInfRTS(e.target.value)}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                              {infortuniOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                          )}
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setMostraPunteggioRTS(false)}
                              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">Annulla</button>
                            <button onClick={punteggioSalva}
                              className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg bg-[#C8102E] hover:bg-[#a50d26]">Salva</button>
                          </div>
                        </div>
                      )}

                      {/* Punteggi RTS — raggruppati per infortunio */}
                      <div className="pt-1 space-y-4">
                        {(() => {
                          const tuttiQ = selected.questionariKinesiofobia ?? [];
                          // Gruppi: infortuni attivi + storico, poi "senza infortunio"
                          const gruppiOpts = [
                            ...infortuniOpts,
                            ...(tuttiQ.some(q => !q.infortunioId) ? [{ id: "__nessuno__", label: "Senza infortunio" }] : []),
                          ];
                          if (gruppiOpts.length === 0 && tuttiQ.length === 0) {
                            return <p className="text-xs text-gray-400 italic">Nessun punteggio registrato</p>;
                          }
                          return gruppiOpts.map((opt) => {
                            const qGruppo = [...tuttiQ]
                              .filter(q => opt.id === "__nessuno__" ? !q.infortunioId : q.infortunioId === opt.id)
                              .sort((a, b) => b.data.localeCompare(a.data));
                            const isAttivo = opt.id === "__corrente__" || (selected.storicoInfortuni ?? []).some(i => i.id === opt.id && i.attivo);
                            return (
                              <div key={opt.id}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate max-w-[70%]">{opt.label}</p>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isAttivo && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-500 font-semibold">In corso</span>
                                    )}
                                    {opt.id !== "__nessuno__" && (
                                      <button onClick={() => { setNuovoInfRTS(opt.id); setMostraPunteggioRTS(true); }}
                                        className="text-xs font-semibold text-[#C8102E] flex items-center gap-0.5">
                                        <Plus className="w-3 h-3" /> Aggiungi
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {qGruppo.length === 0 ? (
                                  <p className="text-xs text-gray-300 italic pl-1">Nessun punteggio</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {qGruppo.map((q) => {
                                      const colore = q.punteggio >= 75 ? "text-green-600" : q.punteggio >= 56 ? "text-orange-500" : "text-red-600";
                                      return (
                                        <div key={q.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-3 py-2">
                                          <div>
                                            {q.tipoTest && <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-2">{q.tipoTest}</span>}
                                            <span className={`text-sm font-bold ${colore}`}>{q.punteggio}/{q.tipoTest === "TSK" ? 40 : 42}</span>
                                            <span className="text-xs text-gray-400 ml-2">{new Date(q.data + "T12:00").toLocaleDateString("it-IT")}</span>
                                          </div>
                                          <button onClick={() => eliminaPunteggio(q.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Referti clinici ── */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Referti clinici</p>
                      {refertoSalvato && (
                        <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Salvato
                        </span>
                      )}
                    </div>
                    <button onClick={() => { setMostraFormReferto(true); setRefertoSalvato(false); }}
                      className="text-xs font-semibold text-[#C8102E] flex items-center gap-0.5 hover:underline">
                      <Plus className="w-3.5 h-3.5" /> Aggiungi
                    </button>
                  </div>

                  {mostraFormReferto && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Nuovo referto</p>
                      <input type="date" value={nuovoReferto.data} onChange={(e) => setNuovoReferto({ ...nuovoReferto, data: e.target.value })}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      <select value={nuovoReferto.tipo} onChange={(e) => setNuovoReferto({ ...nuovoReferto, tipo: e.target.value })}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
                        <option value="">Tipo referto *</option>
                        {TIPI_REFERTO.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={nuovoReferto.esito} onChange={(e) => setNuovoReferto({ ...nuovoReferto, esito: e.target.value })}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
                        <option value="">Esito *</option>
                        {ESITI_REFERTO.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                      <textarea placeholder="Descrizione / Referto (opzionale)" value={nuovoReferto.descrizione}
                        onChange={(e) => setNuovoReferto({ ...nuovoReferto, descrizione: e.target.value })}
                        rows={3}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E] resize-none" />
                      <input placeholder="Note (opzionale)" value={nuovoReferto.note}
                        onChange={(e) => setNuovoReferto({ ...nuovoReferto, note: e.target.value })}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setMostraFormReferto(false); setNuovoReferto({ data: new Date().toISOString().slice(0, 10), tipo: "", esito: "", descrizione: "", note: "" }); }}
                          disabled={refertoSaving}
                          className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-40">Annulla</button>
                        <button onClick={salvaReferto} disabled={!nuovoReferto.tipo || !nuovoReferto.esito || refertoSaving}
                          className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg bg-[#C8102E] hover:bg-[#a50d26] disabled:opacity-40 min-w-[64px]">
                          {refertoSaving ? "Salvataggio…" : "Salva"}
                        </button>
                      </div>
                    </div>
                  )}

                  {(selected.refertiClinici ?? []).length === 0 && !mostraFormReferto ? (
                    <p className="text-xs text-gray-400 italic">Nessun referto registrato</p>
                  ) : (
                    <div className="space-y-2">
                      {[...(selected.refertiClinici ?? [])].sort((a, b) => b.data.localeCompare(a.data)).map((r) => {
                        const ESITO_STYLE: Record<string, string> = {
                          "Positivo": "bg-red-100 text-red-700",
                          "In miglioramento": "bg-yellow-100 text-yellow-700",
                          "Negativo": "bg-green-100 text-green-700",
                        };
                        return (
                          <div key={r.id} className="bg-white border border-gray-100 rounded-xl px-3.5 py-3 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="text-xs font-semibold text-gray-800">{r.tipo}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ESITO_STYLE[r.esito] ?? "bg-gray-100 text-gray-600"}`}>{r.esito}</span>
                                <span className="text-[10px] text-gray-400">{new Date(r.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</span>
                              </div>
                              {r.descrizione && <p className="text-xs text-gray-700 mt-1 leading-relaxed whitespace-pre-wrap">{r.descrizione}</p>}
                              {r.note && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.note}</p>}
                            </div>
                            <button onClick={() => eliminaReferto(r.id)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Storico infortuni ── */
              (() => {
                const _seenUI = new Set<string>();
                const storico = (selected.storicoInfortuni ?? []).filter((inf) => {
                  const key = `${inf.diagnosi}|${inf.inizioRehab}|${inf.fineRehab ?? ""}`;
                  if (_seenUI.has(key)) return false;
                  _seenUI.add(key);
                  return true;
                });
                const concorrenti = storico.filter((inf) => inf.attivo === true);
                const precedenti = storico.filter((inf) => !inf.attivo);
                const isSessione = (p: Programma) => !p.riposo;
                const matchInf = (p: Programma, inf: InfortunioStorico) => {
                  if (p.infortunioId && p.infortunioId !== "__corrente__") return p.infortunioId === inf.id;
                  if (p.infortunioId === "__corrente__") {
                    // Sessione orfana: mappa per data sull'infortunio archiviato
                    if (!p.data || !inf.inizioRehab) return false;
                    if (p.data < inf.inizioRehab) return false;
                    if (inf.fineRehab && p.data > inf.fineRehab) return false;
                    // Se l'atleta è attualmente infortunato, non assegnare sessioni dopo
                    // l'inizio del nuovo infortunio (appartengono a quello corrente)
                    if ((selected.stato === "Infortunato" || selected.stato === "NTL") && selected.inizioRehab && p.data >= selected.inizioRehab) return false;
                    return true;
                  }
                  if (!p.data || !inf.inizioRehab) return false;
                  if (p.data < inf.inizioRehab) return false;
                  if (inf.fineRehab && p.data > inf.fineRehab) return false;
                  return true;
                };
                const giorniPerInf = (inf: InfortunioStorico) =>
                  programmiAtleta.filter((p) => matchInf(p, inf) && isSessione(p)).length;
                // sessioni già attribuite agli infortuni concorrenti (evita doppio conteggio)
                const concurrentSessIds = new Set(
                  programmiAtleta
                    .filter((p) => concorrenti.some((inf) => matchInf(p, inf)) && isSessione(p))
                    .map((p) => p.id)
                );
                const giorniCorrente = (selected.stato === "Infortunato" || selected.stato === "NTL") && selected.inizioRehab
                  ? programmiAtleta.filter((p) => (
                      (p.infortunioId === "__corrente__" && p.data >= selected.inizioRehab) ||
                      (!p.infortunioId && p.data >= selected.inizioRehab && !concurrentSessIds.has(p.id))
                    ) && isSessione(p)).length
                  : 0;
                const totaleStagione = programmiAtleta.filter(isSessione).length;

                const fmtData = (d: string) =>
                  d ? new Date(d + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

                return (
                  <div className="space-y-4 text-sm">
                    {/* Stat tiles */}
                    <div className={`grid gap-3 ${(selected.stato === "Infortunato" || selected.stato === "NTL") ? "grid-cols-2" : "grid-cols-1"}`}>
                      {(selected.stato === "Infortunato" || selected.stato === "NTL") && (
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 text-center">
                          <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-widest mb-1">Infortuni attivi</p>
                          <p className="text-3xl font-bold text-orange-600 leading-none">{1 + concorrenti.length}</p>
                          <p className="text-[11px] text-orange-400 mt-1">in corso</p>
                        </div>
                      )}
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1">Totale stagione</p>
                        <p className="text-3xl font-bold text-gray-700 leading-none">{totaleStagione}</p>
                        <p className="text-[11px] text-gray-400 mt-1">sessioni</p>
                      </div>
                    </div>

                    {/* PDF download */}
                    <button onClick={scaricaPDFStorico}
                      className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 text-xs font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                      <FileDown className="w-3.5 h-3.5" /> Scarica PDF completo
                    </button>
                    <button onClick={scaricaCSVStorico}
                      className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 text-xs font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                      <FileDown className="w-3.5 h-3.5" /> Scarica CSV completo
                    </button>

                    {/* Infortuni in corso */}
                    {(selected.stato === "Infortunato" || selected.stato === "NTL") && (selected.infortunio || selected.inizioRehab) && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">In corso</p>
                        <div className="space-y-2">
                          {/* Infortunio principale */}
                          <div className="border border-orange-200 rounded-2xl p-4 space-y-2 bg-white">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-gray-900 leading-tight">{selected.infortunio || "—"}</span>
                              <span className="shrink-0 text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                                {giorniCorrente} sess.
                              </span>
                            </div>
                            {selected.tipoInfortunio && (
                              <p className="text-xs text-gray-400">{selected.tipoInfortunio}</p>
                            )}
                            <p className="text-xs text-gray-400">
                              Dal {fmtData(selected.inizioRehab)} <span className="text-orange-400 font-medium">· in corso</span>
                            </p>
                          </div>

                          {/* Infortuni concorrenti */}
                          {concorrenti.map((inf) => {
                            const storicoIdx = storico.indexOf(inf);
                            return (
                              <div key={inf.id} className="border border-orange-200 rounded-2xl p-4 space-y-2 bg-white">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-semibold text-gray-900 leading-tight">{inf.diagnosi}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                                      {giorniPerInf(inf)} sess.
                                    </span>
                                    <button onClick={() => { setEditStorico({ inf, idx: storicoIdx }); setEditStoricoForm({ ...inf }); }}
                                      className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600" title="Modifica">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => chiudiInfortBis(inf.id)}
                                      className="p-1 rounded-lg hover:bg-green-50 text-gray-300 hover:text-green-600" title="Chiudi infortunio">
                                      <CheckCircle2 className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => eliminaInfortunioStorico(inf)}
                                      className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500" title="Elimina infortunio">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                {inf.tipo && <p className="text-xs text-gray-400">{inf.tipo}</p>}
                                <p className="text-xs text-gray-400">
                                  Dal {fmtData(inf.inizioRehab)} <span className="text-orange-400 font-medium">· in corso</span>
                                </p>
                                {inf.note && <p className="text-xs text-gray-400 italic">{inf.note}</p>}
                                {/* Edit form inline */}
                                {editStorico?.idx === storicoIdx && editStoricoForm && (
                                  <div className="space-y-2 pt-1 border-t border-gray-100 mt-2">
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Diagnosi</p>
                                      <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                        value={editStoricoForm.diagnosi}
                                        onChange={(e) => setEditStoricoForm({ ...editStoricoForm, diagnosi: e.target.value })} />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Tipo</p>
                                      <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                        value={editStoricoForm.tipo ?? ""}
                                        onChange={(e) => setEditStoricoForm({ ...editStoricoForm, tipo: e.target.value || undefined })}>
                                        <option value="">—</option>
                                        {TIPI_INFORTUNIO.map((t) => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Inizio</p>
                                      <input type="date" className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                        value={editStoricoForm.inizioRehab}
                                        onChange={(e) => setEditStoricoForm({ ...editStoricoForm, inizioRehab: e.target.value })} />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Note</p>
                                      <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                        value={editStoricoForm.note ?? ""}
                                        onChange={(e) => setEditStoricoForm({ ...editStoricoForm, note: e.target.value || undefined })} />
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                      <button onClick={salvaEditStorico}
                                        className="flex-1 bg-[#C8102E] text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-800">Salva</button>
                                      <button onClick={() => { setEditStorico(null); setEditStoricoForm(null); }}
                                        className="flex-1 border border-gray-200 text-gray-500 text-xs font-semibold py-1.5 rounded-lg hover:bg-gray-50">Annulla</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Aggiungi infortunio concorrente */}
                          {!mostraFormInfortBis ? (
                            <button onClick={() => setMostraFormInfortBis(true)}
                              className="w-full flex items-center justify-center gap-1.5 border border-dashed border-orange-200 text-orange-500 text-xs font-semibold py-2 rounded-xl hover:bg-orange-50 transition-colors">
                              <Plus className="w-3.5 h-3.5" /> Aggiungi infortunio
                            </button>
                          ) : (
                            <div className="border border-orange-200 rounded-2xl p-4 space-y-2 bg-orange-50">
                              <p className="text-xs font-semibold text-orange-700">Nuovo infortunio concorrente</p>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Diagnosi *</p>
                                <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  placeholder="es. Distorsione caviglia dx"
                                  value={nuovoInfortBis.diagnosi}
                                  onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, diagnosi: e.target.value })} />
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Tipo</p>
                                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.tipo}
                                  onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, tipo: e.target.value })}>
                                  <option value="">—</option>
                                  {TIPI_INFORTUNIO.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Inizio rehab</p>
                                <input type="date" className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.inizioRehab}
                                  onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, inizioRehab: e.target.value })} />
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Evento</p>
                                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.evento} onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, evento: e.target.value })}>
                                  <option value="">—</option>
                                  {EVENTI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Meccanismo</p>
                                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.meccanismo} onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, meccanismo: e.target.value })}>
                                  <option value="">—</option>
                                  {MECCANISMI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Contatto</p>
                                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.contatto} onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, contatto: e.target.value })}>
                                  <option value="">—</option>
                                  {CONTATTI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Lato</p>
                                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.lato} onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, lato: e.target.value })}>
                                  <option value="">—</option>
                                  {LATI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Posizione</p>
                                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.posizioneInfortunio} onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, posizioneInfortunio: e.target.value })}>
                                  <option value="">—</option>
                                  {POSIZIONI_INFORTUNIO.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Classificazione OSIICS</p>
                                <OsiicsCombobox
                                  value={nuovoInfortBis.osiicsCodeId ? { id: nuovoInfortBis.osiicsCodeId, codice: nuovoInfortBis.osiicsCodice, descrizioneIta: nuovoInfortBis.osiicsDescrizione } : null}
                                  onChange={(code: OsiicsCode | null) => {
                                    if (code) setNuovoInfortBis({ ...nuovoInfortBis, osiicsCodeId: code.id, osiicsCodice: code.codice, osiicsDescrizione: code.descrizioneIta });
                                    else setNuovoInfortBis({ ...nuovoInfortBis, osiicsCodeId: "", osiicsCodice: "", osiicsDescrizione: "" });
                                  }}
                                />
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Note</p>
                                <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                                  value={nuovoInfortBis.note}
                                  onChange={(e) => setNuovoInfortBis({ ...nuovoInfortBis, note: e.target.value })} />
                              </div>
                              <DettaglioSituazionale
                                ref={nuovoDettaglioRef}
                                contatto={nuovoInfortBis.contatto}
                              />
                              <div className="flex gap-2 pt-1">
                                <button onClick={aggiungiInfortBis}
                                  className="flex-1 bg-[#C8102E] text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-800">Salva</button>
                                <button onClick={() => { setMostraFormInfortBis(false); setNuovoInfortBis({ tipo: "", diagnosi: "", inizioRehab: new Date().toISOString().slice(0, 10), note: "", evento: "", meccanismo: "", contatto: "", lato: "", posizioneInfortunio: "", osiicsCodice: "", osiicsDescrizione: "", osiicsCodeId: "" }); nuovoDettaglioRef.current?.reset(); }}
                                  className="flex-1 border border-gray-200 text-gray-500 text-xs font-semibold py-1.5 rounded-lg hover:bg-white">Annulla</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Storico archiviato */}
                    {precedenti.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Infortuni precedenti</p>
                        <div className="space-y-2">
                          {[...precedenti].reverse().map((inf) => {
                            const storicoIdx = storico.indexOf(inf);
                            const isEditing = editStorico?.idx === storicoIdx;
                            return (
                              <div key={inf.id} className="border border-gray-100 rounded-2xl p-4 space-y-2 bg-white">
                                {isEditing && editStoricoForm ? (
                                  /* ── Form modifica inline ── */
                                  <div className="space-y-2">
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Diagnosi</p>
                                      <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                        value={editStoricoForm.diagnosi}
                                        onChange={(e) => setEditStoricoForm({ ...editStoricoForm, diagnosi: e.target.value })} />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Tipo infortunio</p>
                                      <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                        value={editStoricoForm.tipo ?? ""}
                                        onChange={(e) => setEditStoricoForm({ ...editStoricoForm, tipo: e.target.value || undefined })}>
                                        <option value="">—</option>
                                        {TIPI_INFORTUNIO.map((t) => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Classificazione OSIICS</p>
                                      <OsiicsCombobox
                                        value={editStoricoForm.osiicsCodeId ? { id: editStoricoForm.osiicsCodeId, codice: editStoricoForm.osiicsCodice ?? "", descrizioneIta: editStoricoForm.osiicsDescrizione ?? "" } : null}
                                        onChange={(code) => {
                                          if (code) setEditStoricoForm({ ...editStoricoForm, osiicsCodeId: code.id, osiicsCodice: code.codice, osiicsDescrizione: code.descrizioneIta });
                                          else setEditStoricoForm({ ...editStoricoForm, osiicsCodeId: undefined, osiicsCodice: undefined, osiicsDescrizione: undefined });
                                        }}
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-xs text-gray-400 mb-0.5">Inizio</p>
                                        <input type="date" className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                          value={editStoricoForm.inizioRehab}
                                          onChange={(e) => setEditStoricoForm({ ...editStoricoForm, inizioRehab: e.target.value })} />
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-400 mb-0.5">Fine</p>
                                        <input type="date" className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                          value={editStoricoForm.fineRehab}
                                          onChange={(e) => setEditStoricoForm({ ...editStoricoForm, fineRehab: e.target.value })} />
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Note</p>
                                      <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                                        value={editStoricoForm.note ?? ""}
                                        onChange={(e) => setEditStoricoForm({ ...editStoricoForm, note: e.target.value || undefined })} />
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                      <button onClick={salvaEditStorico}
                                        className="flex-1 bg-[#C8102E] text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-800">
                                        Salva
                                      </button>
                                      <button onClick={() => { setEditStorico(null); setEditStoricoForm(null); }}
                                        className="flex-1 border border-gray-200 text-gray-500 text-xs font-semibold py-1.5 rounded-lg hover:bg-gray-50">
                                        Annulla
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  /* ── Vista card normale ── */
                                  <>
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="font-semibold text-gray-900 leading-tight flex-1">{inf.diagnosi}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                                          {giorniPerInf(inf)} sess.
                                        </span>
                                        <button onClick={() => { setEditStorico({ inf, idx: storicoIdx }); setEditStoricoForm({ ...inf }); }}
                                          className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600" title="Modifica">
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => ripristinaInfortunio(inf, storicoIdx)}
                                          className="p-1 rounded-lg hover:bg-orange-50 text-gray-300 hover:text-orange-500" title="Ripristina come attivo">
                                          <RotateCcw className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => eliminaInfortunioStorico(inf)}
                                          className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500" title="Elimina infortunio">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                    {inf.tipo && (
                                      <p className="text-xs text-gray-400">{inf.tipo}</p>
                                    )}
                                    <p className="text-xs text-gray-400">
                                      {fmtData(inf.inizioRehab)} → {fmtData(inf.fineRehab)}
                                    </p>
                                    {inf.note && <p className="text-xs text-gray-400 italic">{inf.note}</p>}
                                    <div className="flex items-center gap-1 text-green-500 pt-0.5">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span className="text-xs font-medium">Recuperato</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {precedenti.length === 0 && concorrenti.length === 0 && selected.stato === "Disponibile" && (
                      <div className="text-center py-10">
                        <Clock className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">Nessun infortunio in archivio</p>
                      </div>
                    )}

                    {storico.length === 0 && (selected.stato === "Infortunato" || selected.stato === "NTL") && !selected.infortunio && !selected.inizioRehab && (
                      <div className="text-center py-10">
                        <Clock className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">Nessun dato disponibile</p>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Modale form */}
      {mostraForm && (
        <AtletaModal
          atletaIniziale={editAtleta}
          onSalva={onSalvaAtleta}
          onChiudi={() => setMostraForm(false)}
        />
      )}
    </div>
  );
}
