"use client";
import { useEffect, useState } from "react";
import { TrendingUp, Download, FileText, Calendar, Filter } from "lucide-react";
import {
  loadAtleti, loadProgrammi, upsertAtleta, uid, nd,
  CATEGORIE, type Atleta, type Stato, type Programma, type InfortunioStorico, type TestFisiometrico,
} from "@/lib/store";

const MESI_BREVI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const CAT_PALETTE = ["#C8102E","#1E40AF","#047857","#B45309","#7C3AED","#0E7490","#BE185D","#374151"];
const TIPO_PALETTE = ["#1D4ED8","#DC2626","#D97706","#059669","#7C3AED","#0891B2","#DB2777","#92400E"];
const hexToRgb = (h: string): [number, number, number] => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];

const STATI: Stato[] = ["Infortunato", "Disponibile"];
const statoColor: Record<Stato, string> = {
  "Infortunato": "bg-orange-100 text-orange-700",
  "Disponibile": "bg-green-100 text-green-700",
};

async function getLogoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch("/logo.png"); if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onloadend = () => res(rd.result as string); rd.onerror = rej; rd.readAsDataURL(blob); });
  } catch { return null; }
}

function csvDownload(rows: string[][], filename: string) {
  const content = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function esportaCSV(atleta: Atleta, programmi: Programma[]) {
  const fmt = (d?: string) => d ? new Date(d + "T12:00").toLocaleDateString("it-IT") : "—";
  const rows: string[][] = [];

  rows.push(["DATI PERSONALI"]);
  rows.push(["Nome", nd(atleta)]);
  rows.push(["Categoria", atleta.categoria ?? "—"]);
  rows.push(["Ruolo", atleta.posizione ?? "—"]);
  rows.push(["Piede dominante", atleta.piedeDominante ?? "—"]);
  rows.push(["Infortunio", atleta.infortunio || "—"]);
  rows.push(["Inizio riabilitazione", fmt(atleta.inizioRehab)]);
  rows.push(["Fine riabilitazione", fmt(atleta.fineRehab)]);
  rows.push(["Stato attuale", atleta.stato]);
  if (atleta.note) rows.push(["Note", atleta.note]);
  rows.push([]);

  if (programmi.length > 0) {
    rows.push(["SESSIONI DI LAVORO"]);
    rows.push(["Data", "Programma", "Fase", "Tipo", "#", "Esercizio/Descrizione", "Serie", "Reps/Durata", "Carico", "RIR", "VAS", "Note"]);
    programmi.forEach(prog => {
      const dataProg = prog.data ? new Date(prog.data + "T12:00").toLocaleDateString("it-IT") : "—";
      prog.esercizi.forEach((e, i) => {
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Palestra", String(i + 1), e.nome, e.serie ?? "—", e.reps ?? "—", e.carico ?? "—", e.rir ?? "—", `${e.vas || "0"}/10`, e.note ?? ""]);
      });
      (prog.esercizicampo ?? []).forEach((c, i) => {
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Campo", String(i + 1), c.descrizione ?? c.tipo ?? "—", c.serie ?? "—", c.durata ?? "—", "", "", "", ""]);
      });
      if (prog.tests?.length) {
        prog.tests.forEach((t, i) => {
          rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Test", String(i + 1), t.nome, "", t.risultato ? `${t.risultato} ${t.unita ?? ""}`.trim() : "—", "", "", "", t.note ?? ""]);
        });
      }
    });
  }

  csvDownload(rows, `${nd(atleta).replace(/ /g, "_")}_rehab.csv`);
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

async function esportaPDF(atleta: Atleta, programmi: Programma[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });
  const red: [number, number, number] = [200, 16, 46];
  const dark: [number, number, number] = [43, 43, 43];
  const gray: [number, number, number] = [130, 130, 130];
  const logoDataUrl = await getLogoDataUrl();
  const oggi = new Date().toLocaleDateString("it-IT");
  const M = 14; const W = 297; const H = 210; const HDR = 30;

  const addHeader = (subtitle?: string) => {
    doc.setFillColor(247, 247, 247);
    doc.rect(0, 0, W, HDR, "F");
    doc.setDrawColor(...red); doc.setLineWidth(0.4); doc.line(0, HDR, W, HDR);
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 4, 4, 22, 22);
    const tx = logoDataUrl ? 30 : M;
    doc.setTextColor(...red); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("U.S. Cremonese", tx, 15);
    doc.setFontSize(9); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(...gray);
    doc.text("Scheda Riabilitativa", tx, 19);
    if (subtitle) { doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray); doc.text(subtitle, tx, 24); }
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(175, 175, 175);
    doc.text("Stagione 2026-2027", W - M, 15, { align: "right" });
  };

  const secTitle = (text: string, y: number) => {
    doc.setFillColor(245, 245, 245); doc.rect(M, y - 4, W - M * 2, 8, "F");
    doc.setFillColor(...red); doc.rect(M, y - 4, 2.5, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...dark);
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

  // ── Pagina 1: dati atleta ──────────────────────────────────────────────────
  addHeader();
  doc.setTextColor(...dark); doc.setFontSize(17); doc.setFont("helvetica", "bold");
  doc.text(nd(atleta), M, HDR + 13);
  const info = [atleta.categoria, atleta.posizione, atleta.piedeDominante ? `Piede ${atleta.piedeDominante}` : ""].filter(Boolean).join("  ·  ");
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
  doc.text(info, M, HDR + 21);
  // badge stato
  doc.setFillColor(...red); doc.roundedRect(W - M - 36, HDR + 7, 36, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
  doc.text(atleta.stato, W - M - 18, HDR + 13.5, { align: "center" });
  doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(M, HDR + 27, W - M, HDR + 27);

  const fmtDCl = (d: string) => new Date(d + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const ggCl = (inizio: string, fine?: string) => fine
    ? `${Math.round((new Date(fine + "T12:00").getTime() - new Date(inizio + "T12:00").getTime()) / 86400000)}gg`
    : "—";

  const tuttiInfortuni: Array<{ tipo?: string; diagnosi: string; inizio: string; fine?: string }> = [];
  if (atleta.infortunio || atleta.inizioRehab)
    tuttiInfortuni.push({ tipo: atleta.tipoInfortunio, diagnosi: atleta.infortunio || "—", inizio: atleta.inizioRehab, fine: atleta.fineRehab });
  (atleta.storicoInfortuni ?? []).forEach((s) =>
    tuttiInfortuni.push({ tipo: s.tipo, diagnosi: s.diagnosi, inizio: s.inizioRehab, fine: s.fineRehab })
  );

  let y = HDR + 34;
  y = secTitle("Dati clinici", y);
  autoTable(doc, {
    startY: y,
    body: [
      ["Piede dominante", atleta.piedeDominante || "—"],
      ["Stato attuale", atleta.stato],
    ],
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", halign: "left", valign: "middle" },
    columnStyles: { 0: { cellWidth: 58, fontStyle: "bold", textColor: dark }, 1: { textColor: dark } },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: M, right: M },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (tuttiInfortuni.length > 0) {
    y = secTitle("Storico infortuni", y);
    autoTable(doc, {
      startY: y,
      head: [["#", "Tipo", "Diagnosi / Infortunio", "Inizio", "Fine", "Giorni"]],
      body: tuttiInfortuni.map((inf, i) => [
        i + 1,
        inf.tipo ?? "—",
        inf.diagnosi,
        inf.inizio ? fmtDCl(inf.inizio) : "—",
        inf.fine ? fmtDCl(inf.fine) : "—",
        inf.inizio ? ggCl(inf.inizio, inf.fine) : "—",
      ]),
      headStyles: { fillColor: dark, textColor: 255, fontSize: 7, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 8, cellPadding: 3, halign: "left", valign: "middle" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: M, right: M },
      columnStyles: {
        0: { cellWidth: 8 }, 1: { cellWidth: 60 }, 2: { cellWidth: 140 },
        3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 17 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (atleta.note) {
    y = secTitle("Note", y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...dark);
    doc.text(doc.splitTextToSize(atleta.note, W - M * 2), M, y);
  }

  // ── Sessioni: tabella settimanale compatta ──────────────────────────────────
  if (programmi.length > 0) {
    doc.addPage();
    addHeader(`${nd(atleta)}  ·  ${atleta.categoria}`);
    y = HDR + 8;
    y = secTitle(`Sessioni di lavoro — ${programmi.length} sessioni`, y);

    const sorted = [...programmi].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));

    const getMonday = (dateStr: string): string => {
      const d = new Date(dateStr + "T12:00");
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d); mon.setDate(diff);
      return mon.toISOString().slice(0, 10);
    };

    const weekMap: Map<string, Programma[]> = new Map();
    for (const prog of sorted) {
      const wk = prog.data ? getMonday(prog.data) : "__nodata__";
      if (!weekMap.has(wk)) weekMap.set(wk, []);
      weekMap.get(wk)!.push(prog);
    }

    const body: any[] = [];
    const weekRowIndices = new Set<number>();
    const subHeaderRowIndices = new Set<number>();
    const altRowIndices = new Set<number>();
    const absenteRowIndices = new Set<number>();
    const riposoRowIndices = new Set<number>();

    Array.from(weekMap.entries()).forEach(([wk, wkProgs]) => {
      let weekLabel: string;
      if (wk === "__nodata__") {
        weekLabel = "SESSIONI SENZA DATA";
      } else {
        const mon = new Date(wk + "T12:00");
        const sun = new Date(mon.getTime() + 6 * 864e5);
        weekLabel = `SETTIMANA  ${mon.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} – ${sun.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
      }
      weekRowIndices.add(body.length);
      body.push([{ content: weekLabel, colSpan: 13 }]);
      subHeaderRowIndices.add(body.length);
      body.push(["Data", "Programma", "Fase", "Fisio", "Obiettivi\nPalestra", "Esercizi\nPalestra", "VAS", "Obiettivi\nCampo", "Esercizi\nCampo", "GPS", "VAS\nCampo", "Test", "RPE"]);

      let dataRowCount = 0;
      for (const prog of wkProgs) {
        const isAlt = dataRowCount % 2 === 1;
        const dataStr = prog.data ? fmtDCl(prog.data) : "—";
        const obP = prog.obiettiviPalestra?.length ? prog.obiettiviPalestra.join(", ") : "—";
        const obCampo = prog.obiettiviCampo?.length ? prog.obiettiviCampo.join(", ") : "—";
        const campoEsLines = (prog.esercizicampo ?? []).map((c) => {
          const parts = [c.tipo, c.serie ? `${c.serie}×` : "", c.durata || ""].filter(Boolean);
          return parts.join(" ");
        });
        const esC = campoEsLines.join("\n") || "—";
        const vasC = (prog.esercizicampo ?? []).map((c) => c.vas || "0").join("\n") || "—";
        const esercizi = prog.esercizi ?? [];

        const testLines = (prog.tests ?? []).map((t) => {
          const isSL = t.nome === "SL Drop Jump";
          const val = [t.risultato, t.risultatoSx ? `Sx ${t.risultatoSx}` : "", t.risultatoDx ? `Dx ${t.risultatoDx}` : "", t.tempo ? `Tempo: ${t.tempo}s` : "", t.livello ? `Liv: ${t.livello}` : "", t.vo2max ? `Vo2Max: ${t.vo2max}` : "", t.vam ? `VAM: ${t.vam}` : ""].filter(Boolean).join(" / ");
          const extras: string[] = [];
          const sxV = isSL ? (t.rsiSx ?? "") : (t.risultatoSx ?? "");
          const dxV = isSL ? (t.rsiDx ?? "") : (t.risultatoDx ?? "");
          const asim = _calcolaAsimmetria(sxV, dxV);
          const sup = _superioreTest(sxV, dxV);
          if (asim !== null && sup !== null) extras.push(`${sup} +${asim.toFixed(1)}%`);
          const prev = _trovaPrecedenteTest(programmi, prog.id, t.nome);
          const delta = _calcolaDelta(t, prev);
          if (delta !== null) extras.push(`${delta >= 0 ? "↑" : "↓"} ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`);
          return `${t.nome}${val ? `: ${val}` : ""}${extras.length ? ` [${extras.join(", ")}]` : ""}`;
        });
        const tests = testLines.join("\n") || "—";

        if (prog.assente) {
          absenteRowIndices.add(body.length);
          body.push([dataStr, prog.nome ?? "—", { content: "ASSENTE" + (prog.noteAssenza ? `\n${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++;
          continue;
        }

        if (prog.riposo) {
          riposoRowIndices.add(body.length);
          body.push([dataStr, prog.nome ?? "—", { content: "RIPOSO" + (prog.noteAssenza ? `\n${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++;
          continue;
        }

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
        ].filter(Boolean).join("\n") || "—";

        const esText = esercizi.map((e) => { const sx = [e.serie, e.reps].filter(Boolean).join("×"); return sx ? `${e.nome} ${sx}` : e.nome; }).join("\n") || "—";
        const vasText = esercizi.map((e) => e.vas || "0").join("\n") || "—";
        const fisio = prog.noteFisioterapia?.trim() || "—";
        if (isAlt) altRowIndices.add(body.length);
        body.push([dataStr, prog.nome ?? "—", prog.fase ?? "—", fisio, obP, esText, vasText, obCampo, esC, gps, vasC, tests, rpe]);
        dataRowCount++;
      }
    });

    autoTable(doc, {
      startY: y,
      body,
      bodyStyles: { fontSize: 7, cellPadding: 2.5, overflow: "linebreak" as const, halign: "left" as const, valign: "middle" as const },
      margin: { left: M, right: M, top: HDR + 8 },
      didDrawPage: () => { addHeader(`${nd(atleta)}  ·  ${atleta.categoria}`); },
      columnStyles: {
        0:  { cellWidth: 15 },
        1:  { cellWidth: 22 },
        2:  { cellWidth: 13 },
        3:  { cellWidth: 18 },
        4:  { cellWidth: 18 },
        5:  { cellWidth: 31 },
        6:  { cellWidth: 10, halign: "center" as const },
        7:  { cellWidth: 28 },
        8:  { cellWidth: 30 },
        9:  { cellWidth: 29 },
        10: { cellWidth: 13, halign: "center" as const },
        11: { cellWidth: 30 },
        12: { cellWidth: 12, halign: "center" as const },
      },
      didParseCell: (data: any) => {
        if (data.section !== "body") return;
        if (weekRowIndices.has(data.row.index)) {
          data.cell.styles.fillColor = [200, 16, 46];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 7.5;
          data.cell.styles.cellPadding = { top: 3.5, bottom: 3.5, left: 5, right: 2 };
        } else if (subHeaderRowIndices.has(data.row.index)) {
          data.cell.styles.fillColor = [110, 110, 110];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 6.5;
          data.cell.styles.halign = "center";
          data.cell.styles.valign = "middle";
          data.cell.styles.cellPadding = { top: 2.5, bottom: 2.5, left: 2, right: 1 };
        } else if (absenteRowIndices.has(data.row.index)) {
          data.cell.styles.fillColor = [255, 237, 213];
          data.cell.styles.textColor = [154, 52, 18];
        } else if (riposoRowIndices.has(data.row.index)) {
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.textColor = [30, 64, 175];
        } else if (altRowIndices.has(data.row.index)) {
          data.cell.styles.fillColor = [243, 244, 246];
        } else {
          data.cell.styles.fillColor = [255, 255, 255];
        }
      },
    });
  }

  addFooter();
  doc.save(`${nd(atleta).replace(/ /g, "_")}_rehab.pdf`);
}

function esportaCSVReportMensile(
  atletiMese: Atleta[], mese: number, anno: number, filtroCat: string,
  mesiP?: { anno: number; mese: number }[], periodoLbl?: string
) {
  const nomeP = periodoLbl ?? `${MESI[mese]} ${anno}`;
  const fmt = (d: string) => new Date(d + "T12:00").toLocaleDateString("it-IT");
  const gg = (inizio: string, fine?: string) => fine
    ? String(Math.round((new Date(fine + "T12:00").getTime() - new Date(inizio + "T12:00").getTime()) / 86400000))
    : "—";

  const rows: string[][] = [];
  rows.push([`U.S. CREMONESE – REHAB AREA – Report ${nomeP}${filtroCat !== "Tutte" ? ` – ${filtroCat}` : ""}`]);
  rows.push([]);
  rows.push(["Nome", "Categoria", "Infortunio", "Tipo", "Inizio", "Fine", "Giorni", "Stato"]);

  atletiMese.forEach(a => {
    const infortuni = infortunitNelPeriodo(a, mesiP ?? [{ anno, mese }]);
    if (infortuni.length === 0) {
      rows.push([nd(a), a.categoria ?? "—", "—", "—", "—", "—", "—", a.stato]);
    } else {
      infortuni.forEach(inf => {
        rows.push([nd(a), a.categoria ?? "—", inf.diagnosi, inf.tipo ?? "—", inf.inizio ? fmt(inf.inizio) : "—", inf.fine ? fmt(inf.fine) : "—", inf.inizio ? gg(inf.inizio, inf.fine) : "—", a.stato]);
      });
    }
  });

  rows.push([]);
  rows.push(["RIEPILOGO PER CATEGORIA"]);
  rows.push(["Categoria", "N. atleti"]);
  CATEGORIE.forEach(cat => {
    const n = atletiMese.filter(a => a.categoria === cat).length;
    if (n) rows.push([cat, String(n)]);
  });
  rows.push(["TOTALE", String(atletiMese.length)]);

  csvDownload(rows, `USC_Report_${nomeP.replace(/[^a-zA-Z0-9]/g, "_")}.csv`);
}

async function esportaPDFReportMensile(
  atletiMese: Atleta[], mese: number, anno: number, filtroCat: string, filtroInf: string,
  atleti?: Atleta[], mesiP?: { anno: number; mese: number }[], periodoLbl?: string
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });
  const red: [number, number, number] = [200, 16, 46];
  const dark: [number, number, number] = [43, 43, 43];
  const gray: [number, number, number] = [130, 130, 130];
  const oggi = new Date().toLocaleDateString("it-IT");
  const nomeP = periodoLbl ?? `${MESI[mese]} ${anno}`;
  const logoDataUrl = await getLogoDataUrl();
  const M = 14; const W = 297; const H = 210; const HDR = 30;

  const addHeader = () => {
    doc.setFillColor(247, 247, 247); doc.rect(0, 0, W, HDR, "F");
    doc.setDrawColor(...red); doc.setLineWidth(0.4); doc.line(0, HDR, W, HDR);
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 4, 4, 22, 22);
    const tx = logoDataUrl ? 30 : M;
    doc.setTextColor(...red); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("U.S. Cremonese", tx, 15);
    doc.setFontSize(9); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(...gray);
    doc.text("Report Rehab Area", tx, 19);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(175, 175, 175);
    doc.text("Stagione 2026-2027", W - M, 15, { align: "right" });
  };

  const secTitle = (text: string, y: number) => {
    doc.setFillColor(245, 245, 245); doc.rect(M, y - 4, W - M * 2, 8, "F");
    doc.setFillColor(...red); doc.rect(M, y - 4, 2.5, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...dark);
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

  addHeader();

  doc.setTextColor(...dark); doc.setFontSize(17); doc.setFont("helvetica", "bold");
  doc.text(nomeP, M, HDR + 13);
  if (filtroCat !== "Tutte") {
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
    doc.text(filtroCat, M, HDR + 21);
  }
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
  doc.text(`${atletiMese.length} atleti nel periodo`, W - M, HDR + 13, { align: "right" });
  doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(M, HDR + 26, W - M, HDR + 26);

  let y = HDR + 33;

  const catRows = CATEGORIE.map((cat) => {
    const n = atletiMese.filter((a) => a.categoria === cat).length;
    return n ? [cat, `${n} atleti`] : null;
  }).filter(Boolean) as any[][];

  if (catRows.length > 0) {
    const totCat: any[] = [{ content: "TOTALE", styles: { fontStyle: "bolditalic" } }, { content: `${atletiMese.length} atleti`, styles: { fontStyle: "bolditalic" } }];
    y = secTitle("Riepilogo per categoria", y);
    autoTable(doc, {
      startY: y, body: [...catRows, totCat], theme: "striped",
      styles: { fontSize: 8, cellPadding: 2.5, overflow: "ellipsize", halign: "left", valign: "middle" },
      columnStyles: { 0: { cellWidth: 45, fontStyle: "bold", textColor: dark }, 1: { cellWidth: 25, textColor: dark } },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: M, right: W / 2 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === catRows.length) {
          data.cell.styles.fillColor = [220, 220, 220];
          data.cell.styles.textColor = dark;
          data.cell.styles.fontStyle = "bolditalic";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Trend mensile 12 mesi impilato ────────────────────────────────────────
  if (atleti && atleti.length > 0) {
    const firstM = mesiP ? mesiP[0] : { anno, mese };
    const trendPeriod = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(firstM.anno, firstM.mese + i, 1);
      return { anno: d.getFullYear(), mese: d.getMonth() };
    });
    const todayT = new Date(); const nowY = todayT.getFullYear(); const nowM = todayT.getMonth();
    const atletiPerTrend = atleti.filter((a) => {
      if (filtroCat && filtroCat !== "Tutte" && a.categoria !== filtroCat) return false;
      if (filtroInf) {
        const q = filtroInf.toLowerCase();
        const inLive = (a.infortunio ?? "").toLowerCase().includes(q);
        const inStorico = (a.storicoInfortuni ?? []).some(
          (s) => s.diagnosi.toLowerCase().includes(q) || (s.tipo ?? "").toLowerCase().includes(q)
        );
        if (!inLive && !inStorico) return false;
      }
      return true;
    });
    const trendR = trendPeriod.map(({ anno: a2, mese: m2 }) => {
      if (a2 > nowY || (a2 === nowY && m2 > nowM)) {
        return { label: MESI_BREVI[m2], total: 0, perCat: {} as Record<string, number>, perTipo: {} as Record<string, number> };
      }
      const attv = atletiPerTrend.filter((a) => atletaAttivoInMese(a, a2, m2));
      const perCat: Record<string, number> = {};
      const perTipo: Record<string, number> = {};
      attv.forEach((a) => {
        if (a.categoria) perCat[a.categoria] = (perCat[a.categoria] ?? 0) + 1;
        const infs = infortunitNelMese(a, a2, m2);
        const tipo = infs.length > 0 ? infs[0].tipo : undefined;
        if (tipo) perTipo[tipo] = (perTipo[tipo] ?? 0) + 1;
      });
      return { label: MESI_BREVI[m2], total: attv.length, perCat, perTipo };
    });
    const maxRVal = Math.max(...trendR.map((t) => t.total), 1);
    const catR = CATEGORIE.filter((cat) => trendR.some((t) => (t.perCat[cat] ?? 0) > 0));
    const tipiR = Array.from(new Set(trendR.flatMap((t) => Object.keys(t.perTipo)))).sort();
    const catColR: Record<string, [number, number, number]> = {};
    catR.forEach((cat) => { const idx = CATEGORIE.indexOf(cat); catColR[cat] = hexToRgb(CAT_PALETTE[(idx >= 0 ? idx : 0) % CAT_PALETTE.length]); });
    const tipoColR: Record<string, [number, number, number]> = {};
    tipiR.forEach((tipo, i) => { tipoColR[tipo] = hexToRgb(TIPO_PALETTE[i % TIPO_PALETTE.length]); });

    const drawBarR = (
      title: string, sy: number,
      keys: string[], getC: (t: typeof trendR[0], k: string) => number,
      colorMap: Record<string, [number, number, number]>
    ): number => {
      const cHr = 38; const cWr = W - M * 2; const slot = cWr / trendR.length;
      doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
      doc.text(title, M + cWr / 2, sy, { align: "center" }); sy += 2;
      doc.setFillColor(248, 248, 248); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
      doc.rect(M, sy, cWr, cHr, "FD");
      const tickStep = Math.max(1, Math.ceil(maxRVal / 4));
      for (let v = tickStep; v <= maxRVal; v += tickStep) {
        const ly = sy + cHr - (v / maxRVal) * cHr;
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2); doc.line(M, ly, M + cWr, ly);
        doc.setFontSize(4); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
        doc.text(`${v}`, M - 1, ly + 1, { align: "right" });
      }
      trendR.forEach((t, i) => {
        const bw = slot * 0.2; const bx = M + i * slot + (slot - bw) / 2;
        let bot = sy + cHr;
        keys.forEach((k) => {
          const cnt = getC(t, k);
          if (!cnt) return;
          const segH = (cnt / maxRVal) * cHr;
          bot -= segH;
          doc.setFillColor(...(colorMap[k] ?? [180, 180, 180] as [number, number, number]));
          doc.rect(bx, bot, bw, segH, "F");
          if (segH >= 3) {
            doc.setFontSize(4); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
            doc.text(`${cnt}`, bx + bw / 2, bot + segH / 2 + 1, { align: "center" });
          }
        });
        doc.setFontSize(4); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
        doc.text(t.label, M + i * slot + slot / 2, sy + cHr + 3, { align: "center" });
      });
      return sy + cHr + 5;
    };

    const drawLegR = (items: string[], colorMap: Record<string, [number, number, number]>, sy: number): number => {
      let lx = M; let ly = sy;
      doc.setFontSize(5); doc.setFont("helvetica", "normal");
      items.forEach((k) => {
        const itemW = doc.getTextWidth(k) + 7;
        if (lx + itemW > W - M) { lx = M; ly += 5; }
        doc.setFillColor(...(colorMap[k] ?? [180, 180, 180] as [number, number, number]));
        doc.rect(lx, ly - 2.5, 3, 3, "F");
        doc.setTextColor(...dark);
        doc.text(k, lx + 4.5, ly + 0.3);
        lx += itemW;
      });
      return ly + 7;
    };

    if (catR.length > 0 || tipiR.length > 0) {
      doc.addPage(); addHeader(); y = HDR + 12;
      y = secTitle(`Trend mensile – ${nomeP}`, y);
      y = drawBarR("Per categoria squadra", y, catR, (t, k) => t.perCat[k] ?? 0, catColR);
      y = drawLegR(catR, catColR, y + 5);
      if (y + 60 > H - 18) { doc.addPage(); addHeader(); y = HDR + 12; }
      y = drawBarR("Per tipo di infortunio", y, tipiR, (t, k) => t.perTipo[k] ?? 0, tipoColR);
      y = drawLegR(tipiR, tipoColR, y + 5);
    }
  }

  doc.addPage(); addHeader(); y = HDR + 12;
  y = secTitle("Atleti del periodo", y);

  const fmtDP = (d: string) => new Date(d + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const ggP = (inizio: string, fine?: string) => fine
    ? `${Math.round((new Date(fine + "T12:00").getTime() - new Date(inizio + "T12:00").getTime()) / 86400000)}gg`
    : "—";

  const pdfRows: any[][] = [];
  const athleteForRowP: number[] = [];
  const atletiMeseOrd = [...atletiMese].sort((a, b) => nd(a).localeCompare(nd(b), "it"));
  atletiMeseOrd.forEach((a, athleteIdx) => {
    const tuttiInf = infortunitNelPeriodo(a, mesiP ?? [{ anno, mese }]);
    const infortuni = filtroInf
      ? tuttiInf.filter((inf) => {
          const q = filtroInf.toLowerCase();
          return inf.diagnosi.toLowerCase().includes(q) || (inf.tipo ?? "").toLowerCase().includes(q);
        })
      : tuttiInf;
    const count = Math.max(infortuni.length, 1);
    if (infortuni.length === 0) {
      pdfRows.push([nd(a), a.categoria, "—", "—", a.meccanismo || "—", a.note || "—", "—", "—", "—", a.stato]);
      athleteForRowP.push(athleteIdx);
    } else {
      infortuni.forEach((inf, i) => {
        const row: any[] = [];
        if (i === 0) {
          row.push(
            { content: nd(a), rowSpan: count, styles: { valign: "middle", fontStyle: "bold" } },
            { content: a.categoria, rowSpan: count, styles: { valign: "middle" } },
          );
        }
        row.push(inf.diagnosi, (inf.tipo ?? "—").replace(/\//g, "/ "));
        if (i === 0) {
          row.push({ content: a.meccanismo || "—", rowSpan: count, styles: { valign: "middle" } });
          row.push({ content: a.note || "—", rowSpan: count, styles: { valign: "middle" } });
        }
        row.push(
          inf.inizio ? fmtDP(inf.inizio) : "—",
          inf.fine ? fmtDP(inf.fine) : "—",
          inf.inizio ? ggP(inf.inizio, inf.fine) : "—",
          a.stato,
        );
        pdfRows.push(row);
        athleteForRowP.push(athleteIdx);
      });
    }
  });

  autoTable(doc, {
    startY: y,
    head: [["Nome", "Categoria", "Infortunio", "Tipo", "Meccanismo", "Note", "Inizio", "Fine", "Giorni", "Stato"]],
    body: pdfRows,
    headStyles: { fillColor: dark, textColor: 255, fontSize: 7, halign: "center", valign: "middle" },
    bodyStyles: { fontSize: 7, cellPadding: 2, halign: "left", valign: "middle" },
    margin: { left: M, right: M },
    columnStyles: {
      0: { cellWidth: 26 }, 1: { cellWidth: 18 }, 2: { cellWidth: 46 },
      3: { cellWidth: 36 }, 4: { cellWidth: 26 }, 5: { cellWidth: 43 },
      6: { cellWidth: 18 }, 7: { cellWidth: 16 }, 8: { cellWidth: 14 }, 9: { cellWidth: 26 },
    },
    didParseCell: (data: any) => {
      if (data.section === "body") {
        const ai = athleteForRowP[data.row.index];
        data.cell.styles.fillColor = ai % 2 !== 0 ? [248, 248, 248] : [255, 255, 255];
      }
    },
  });

  addFooter();
  doc.save(`USC_Report_${nomeP.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}

type PageTab = "progressi" | "report";
type TipoReport = "mensile" | "trimestrale" | "semestrale" | "annuale" | "stagione";

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function atletaAttivoInMese(a: Atleta, anno: number, mese: number): boolean {
  const meseStart = new Date(anno, mese, 1);
  const meseEnd = new Date(anno, mese + 1, 0);
  const periodoAttivo = (inizioStr?: string, fineStr?: string): boolean => {
    if (!inizioStr) return false;
    const inizio = new Date(inizioStr + "T12:00");
    if (inizio > meseEnd) return false; // not yet started this month
    if (fineStr) return new Date(fineStr + "T12:00") >= meseStart;
    return true; // still ongoing
  };
  // Infortunio attivo corrente
  if (periodoAttivo(a.inizioRehab, a.fineRehab)) return true;
  // Infortuni passati archiviati (atleta guarito): contano nei mesi in cui si è svolta la riabilitazione
  return (a.storicoInfortuni ?? []).some((s) => periodoAttivo(s.inizioRehab, s.fineRehab));
}

type InfortunioNelMese = { diagnosi: string; tipo?: string; inizio: string; fine?: string };
function infortunitNelMese(a: Atleta, anno: number, mese: number): InfortunioNelMese[] {
  const meseStart = new Date(anno, mese, 1);
  const meseEnd = new Date(anno, mese + 1, 0);
  const inMese = (inizioStr?: string, fineStr?: string): boolean => {
    if (!inizioStr) return false;
    const inizio = new Date(inizioStr + "T12:00");
    if (inizio > meseEnd) return false;
    if (fineStr) return new Date(fineStr + "T12:00") >= meseStart;
    return true;
  };
  const result: InfortunioNelMese[] = [];
  if (inMese(a.inizioRehab, a.fineRehab) && a.infortunio)
    result.push({ diagnosi: a.infortunio, tipo: a.tipoInfortunio, inizio: a.inizioRehab, fine: a.fineRehab });
  (a.storicoInfortuni ?? []).forEach((s) => {
    if (inMese(s.inizioRehab, s.fineRehab))
      result.push({ diagnosi: s.diagnosi, tipo: s.tipo, inizio: s.inizioRehab, fine: s.fineRehab });
  });
  return result;
}

function infortunitNelPeriodo(a: Atleta, mesi: { anno: number; mese: number }[]): InfortunioNelMese[] {
  const seen = new Set<string>();
  const result: InfortunioNelMese[] = [];
  for (const { anno, mese } of mesi)
    infortunitNelMese(a, anno, mese).forEach((inf) => {
      const key = `${inf.diagnosi}|${inf.inizio ?? ""}`;
      if (!seen.has(key)) { seen.add(key); result.push(inf); }
    });
  return result;
}

export default function ProgressiPage() {
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [programmi, setProgrammi] = useState<Programma[]>([]);
  const [esportando, setEsportando] = useState<string | null>(null);
  const [esportandoReport, setEsportandoReport] = useState<"excel" | "pdf" | null>(null);
  const [pageTab, setPageTab] = useState<PageTab>("progressi");

  const oggi = new Date();
  const [reportAnno, setReportAnno] = useState(oggi.getFullYear());
  const [reportMese, setReportMese] = useState(oggi.getMonth());
  const [filtroCat, setFiltroCat] = useState("Tutte");
  const [filtroInf, setFiltroInf] = useState("");
  const [tipoReport, setTipoReport] = useState<TipoReport>("mensile");
  const [stagioneMeseInizio, setStagioneMeseInizio] = useState(6);
  const [stagioneMeseFine, setStagioneMeseFine] = useState(5);

  useEffect(() => {
    loadAtleti().then(setAtleti);
    loadProgrammi().then(setProgrammi);
  }, []);

  const mesiPeriodo: { anno: number; mese: number }[] = (() => {
    if (tipoReport === "mensile") return [{ anno: reportAnno, mese: reportMese }];
    const mesi: { anno: number; mese: number }[] = [];
    const crossYear = stagioneMeseInizio > stagioneMeseFine;
    const annoStart = crossYear ? reportAnno - 1 : reportAnno;
    let m = stagioneMeseInizio;
    let a = annoStart;
    while (mesi.length < 24) {
      mesi.push({ anno: a, mese: m });
      if (m === stagioneMeseFine && a === reportAnno) break;
      m = (m + 1) % 12;
      if (m === 0) a++;
    }
    return mesi;
  })();

  const periodoLabel = (() => {
    if (tipoReport === "mensile") return `${MESI[reportMese]} ${reportAnno}`;
    const first = mesiPeriodo[0];
    const last = mesiPeriodo[mesiPeriodo.length - 1];
    const annoLbl = first.anno === last.anno ? `${first.anno}` : `${first.anno}–${last.anno}`;
    const tipoLbl = tipoReport === "trimestrale" ? "Trimestre" : tipoReport === "semestrale" ? "Semestre" : tipoReport === "annuale" ? "Anno" : "Stagione";
    return `${tipoLbl} ${MESI[first.mese]}–${MESI[last.mese]} ${annoLbl}`;
  })();

  const aggiorna = (id: string, campo: keyof Atleta, valore: string | number) => {
    let updatedAtleta: Atleta | undefined;
    const nuovi = atleti.map((a) => {
      if (a.id !== id) return a;
      const updated: Atleta = { ...a, [campo]: valore };
      if (campo === "stato" && valore === "Disponibile") {
        const fineRehab = a.fineRehab ?? new Date().toISOString().slice(0, 10);
        updated.fineRehab = fineRehab;
        // Archivia l'infortunio corrente se presente
        if (a.infortunio || a.inizioRehab) {
          const inf: InfortunioStorico = {
            id: uid(),
            tipo: a.tipoInfortunio,
            diagnosi: a.infortunio || "—",
            inizioRehab: a.inizioRehab,
            fineRehab,
            note: a.note || undefined,
          };
          updated.storicoInfortuni = [...(a.storicoInfortuni ?? []), inf];
        }
        // Pulisce i campi dell'infortunio attivo
        updated.infortunio = "";
        updated.tipoInfortunio = undefined;
        updated.inizioRehab = "";
        updated.fineRehab = undefined;
        updated.progresso = 100;
      }
      updatedAtleta = updated;
      return updated;
    });
    setAtleti(nuovi);
    if (updatedAtleta) upsertAtleta(updatedAtleta);
  };

  const handleExport = async (atleta: Atleta, tipo: "excel" | "pdf") => {
    setEsportando(atleta.id + tipo);
    const prog = programmi.filter((p) => p.atletaId === atleta.id);
    try {
      if (tipo === "excel") esportaCSV(atleta, prog);
      else await esportaPDF(atleta, prog);
    } finally {
      setEsportando(null);
    }
  };

  // Report periodo
  const atletiMese = atleti.filter((a) => {
    if (!mesiPeriodo.some(({ anno, mese }) => atletaAttivoInMese(a, anno, mese))) return false;
    if (filtroCat !== "Tutte" && a.categoria !== filtroCat) return false;
    if (filtroInf) {
      const q = filtroInf.toLowerCase();
      const inLive = (a.infortunio ?? "").toLowerCase().includes(q);
      const inStorico = (a.storicoInfortuni ?? []).some(
        (s) => s.diagnosi.toLowerCase().includes(q) || (s.tipo ?? "").toLowerCase().includes(q)
      );
      if (!inLive && !inStorico) return false;
    }
    return true;
  });

  const anni = Array.from({ length: 5 }, (_, i) => oggi.getFullYear() - 2 + i);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Progressi</h1>
          <p className="text-gray-500 mt-1">Aggiorna e scarica la scheda riabilitativa</p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1">
          {(["progressi", "report"] as PageTab[]).map((t) => (
            <button key={t} onClick={() => setPageTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                pageTab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}>
              {t === "progressi" ? "Progressi" : "Report"}
            </button>
          ))}
        </div>
      </div>

      {pageTab === "progressi" ? (
        atleti.length === 0 ? (
          <div className="text-center py-20">
            <TrendingUp className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 text-lg font-medium">Nessun atleta ancora</p>
          </div>
        ) : (
          <div className="space-y-4">
            {[...atleti].sort((a, b) => nd(a).localeCompare(nd(b), "it")).map((atleta) => {
              const nProg = programmi.filter((p) => p.atletaId === atleta.id).length;
              return (
                <div key={atleta.id} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-[#2B2B2B] rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {nd(atleta).trim().split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>(w[0]??"").toUpperCase()).join("")}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{nd(atleta)}</h3>
                        <p className="text-sm text-gray-500 truncate">
                          {atleta.categoria}{atleta.posizione ? ` · ${atleta.posizione}` : ""}
                          {nProg > 0 ? ` · ${nProg} programm${nProg === 1 ? "a" : "i"}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleExport(atleta, "excel")} disabled={!!esportando}
                        className="flex items-center gap-1.5 border border-green-300 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-50 disabled:opacity-50">
                        <Download className="w-3.5 h-3.5" />
                        {esportando === atleta.id + "excel" ? "..." : "CSV"}
                      </button>
                      <button onClick={() => handleExport(atleta, "pdf")} disabled={!!esportando}
                        className="flex items-center gap-1.5 border border-red-200 text-[#C8102E] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50">
                        <FileText className="w-3.5 h-3.5" />
                        {esportando === atleta.id + "pdf" ? "..." : "PDF"}
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Stato</label>
                    <div className="flex flex-wrap gap-2">
                      {STATI.map((s) => (
                        <button key={s} onClick={() => aggiorna(atleta.id, "stato", s)}
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                            atleta.stato === s ? statoColor[s] + " ring-2 ring-offset-1 ring-current" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}>
                          {s}
                        </button>
                      ))}
                    </div>
                    {atleta.stato === "Disponibile" && atleta.fineRehab && (
                      <p className="text-xs text-gray-400 mt-1">
                        Fine riab.: {new Date(atleta.fineRehab + "T12:00").toLocaleDateString("it-IT")}
                      </p>
                    )}
                  </div>

                  {atleta.infortunio && (
                    <p className="text-xs text-gray-400 mt-3">{atleta.infortunio}</p>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Report mensile */
        <div className="space-y-5">
          {/* Filtri */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-[#C8102E]" />
              <h2 className="font-bold text-gray-900">Seleziona periodo e filtri</h2>
            </div>
            {/* Tipo report */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(["mensile", "trimestrale", "semestrale", "annuale", "stagione"] as TipoReport[]).map((t) => (
                <button key={t} onClick={() => setTipoReport(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    tipoReport === t ? "bg-[#C8102E] text-white border-[#C8102E]" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  {t === "mensile" ? "Mensile" : t === "trimestrale" ? "Trimestrale" : t === "semestrale" ? "Semestrale" : t === "annuale" ? "Annuale" : "Fine stagione"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {tipoReport === "mensile" && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mese</label>
                  <select value={reportMese} onChange={(e) => setReportMese(Number(e.target.value))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                    {MESI.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </div>
              )}
              {tipoReport !== "mensile" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mese inizio</label>
                    <select value={stagioneMeseInizio} onChange={(e) => setStagioneMeseInizio(Number(e.target.value))}
                      className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                      {MESI.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mese fine</label>
                    <select value={stagioneMeseFine} onChange={(e) => setStagioneMeseFine(Number(e.target.value))}
                      className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                      {MESI.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {tipoReport !== "mensile" && stagioneMeseInizio > stagioneMeseFine ? "Anno fine" : "Anno"}
                </label>
                <select value={reportAnno} onChange={(e) => setReportAnno(Number(e.target.value))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  {anni.map((a) => <option key={a} value={a}>{tipoReport !== "mensile" && stagioneMeseInizio > stagioneMeseFine ? `${a - 1}–${a}` : a}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</label>
                <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option>Tutte</option>
                  {CATEGORIE.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo infortunio</label>
                <input value={filtroInf} onChange={(e) => setFiltroInf(e.target.value)}
                  placeholder="Es. LCA, menisco…"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
            </div>
          </div>

          {/* Risultati */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-gray-900">
                {periodoLabel}
                {filtroCat !== "Tutte" && ` · ${filtroCat}`}
                <span className="ml-2 text-sm font-bold text-[#C8102E]">{atletiMese.length} atleti</span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => { setEsportandoReport("excel"); try { esportaCSVReportMensile(atletiMese, reportMese, reportAnno, filtroCat, mesiPeriodo, periodoLabel); } finally { setEsportandoReport(null); } }}
                  disabled={!!esportandoReport || atletiMese.length === 0}
                  className="flex items-center gap-1.5 border border-green-300 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-50 disabled:opacity-50">
                  <Download className="w-3.5 h-3.5" />
                  {esportandoReport === "excel" ? "..." : "CSV"}
                </button>
                <button
                  onClick={async () => { setEsportandoReport("pdf"); try { await esportaPDFReportMensile(atletiMese, reportMese, reportAnno, filtroCat, filtroInf, atleti, mesiPeriodo, periodoLabel); } finally { setEsportandoReport(null); } }}
                  disabled={!!esportandoReport || atletiMese.length === 0}
                  className="flex items-center gap-1.5 border border-red-200 text-[#C8102E] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50">
                  <FileText className="w-3.5 h-3.5" />
                  {esportandoReport === "pdf" ? "..." : "PDF"}
                </button>
              </div>
            </div>

            {atletiMese.length === 0 ? (
              <div className="py-12 text-center">
                <Filter className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Nessun atleta con percorso riabilitativo in questo periodo</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {/* Raggruppamento per categoria */}
                {CATEGORIE.map((cat) => {
                  const lista = atletiMese.filter((a) => a.categoria === cat).sort((a, b) => nd(a).localeCompare(nd(b), "it"));
                  if (!lista.length) return null;
                  return (
                    <div key={cat}>
                      <div className="px-5 py-2 bg-gray-50 flex items-center gap-2">
                        <span className="text-xs font-bold text-[#C8102E] uppercase tracking-widest">{cat}</span>
                        <span className="text-xs bg-white text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">{lista.length}</span>
                      </div>
                      {lista.map((a) => {
                        const tuttiInf = infortunitNelPeriodo(a, mesiPeriodo);
                        const infortuni = filtroInf
                          ? tuttiInf.filter((inf) => {
                              const q = filtroInf.toLowerCase();
                              return inf.diagnosi.toLowerCase().includes(q) || (inf.tipo ?? "").toLowerCase().includes(q);
                            })
                          : tuttiInf;
                        const fmtD = (d: string) => new Date(d + "T12:00").toLocaleDateString("it-IT");
                        return (
                        <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50">
                          <div className="w-9 h-9 bg-[#2B2B2B] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                            {nd(a).trim().split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>(w[0]??"").toUpperCase()).join("")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{nd(a)}</p>
                            <div className="space-y-1.5 mt-1">
                              {infortuni.length === 0 ? (
                                <p className="text-xs text-gray-400">—</p>
                              ) : (
                                infortuni.map((inf, i) => (
                                  <div key={i}>
                                    <p className="text-sm text-gray-700 font-medium leading-snug">{inf.diagnosi}</p>
                                    <p className="text-xs text-gray-400">
                                      {inf.tipo ? `${inf.tipo} · ` : ""}
                                      {inf.inizio ? fmtD(inf.inizio) : ""}
                                      {inf.fine ? ` → ${fmtD(inf.fine)}` : ""}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statoColor[a.stato]}`}>
                              {a.stato}
                            </span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
