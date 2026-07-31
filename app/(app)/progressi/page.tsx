"use client";
import { useEffect, useState } from "react";
import { TrendingUp, Download, FileText, Calendar, Filter, ChevronDown, FlaskConical } from "lucide-react";
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
  rows.push(["Codice OSIICS", atleta.osiicsCodice ? `${atleta.osiicsCodice}${atleta.osiicsDescrizione ? ` – ${atleta.osiicsDescrizione}` : ""}` : "—"]);
  if (atleta.note) rows.push(["Note", atleta.note]);
  rows.push([]);

  if (programmi.length > 0) {
    rows.push(["SESSIONI DI LAVORO"]);
    rows.push(["Data", "Programma", "Fase", "Tipo", "#", "Esercizio/Descrizione", "Serie", "Reps/Durata", "Carico", "RIR", "VAS", "Note"]);
    programmi.forEach(prog => {
      const dataProg = prog.data ? new Date(prog.data + "T12:00").toLocaleDateString("it-IT") : "—";
      prog.esercizi.forEach((e, i) => {
        rows.push([dataProg, prog.nome ?? "—", prog.fase ?? "—", "Palestra", String(i + 1), e.nome, e.serie ?? "—", e.reps || e.durata || "—", e.carico ?? "—", e.rir ?? "—", `${e.vas || "0"}/10`, e.note ?? ""]);
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
  if (curr.altezzaSalto && prev.altezzaSalto) { const c = parseFloat(curr.altezzaSalto), p = parseFloat(prev.altezzaSalto); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  if (curr.risultatoSx || curr.risultatoDx) { const c = avg([curr.risultatoSx, curr.risultatoDx]), p = avg([prev.risultatoSx, prev.risultatoDx]); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  if (curr.risultato && prev.risultato) { const c = parseFloat(curr.risultato), p = parseFloat(prev.risultato); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  if (curr.vo2max && prev.vo2max) { const c = parseFloat(curr.vo2max), p = parseFloat(prev.vo2max); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  if (curr.tempo && prev.tempo) { const c = parseFloat(curr.tempo), p = parseFloat(prev.tempo); if (isNaN(c) || isNaN(p) || p <= 0) return null; return ((c - p) / p) * 100; }
  return null;
}

function getTestMainValue(t: TestFisiometrico): number | null {
  const avg = (...vals: (string | undefined)[]): number | null => {
    const nums = vals.map(v => parseFloat(v ?? "")).filter(v => !isNaN(v) && v > 0);
    return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
  };
  if (t.rsiSx || t.rsiDx) return avg(t.rsiSx, t.rsiDx);
  if (t.rsi) { const v = parseFloat(t.rsi); return isNaN(v) ? null : v; }
  if (t.altezzaSalto) { const v = parseFloat(t.altezzaSalto); return isNaN(v) ? null : v; }
  if (t.vo2max) { const v = parseFloat(t.vo2max); return isNaN(v) ? null : v; }
  if (t.tempo) { const v = parseFloat(t.tempo); return isNaN(v) ? null : v; }
  if (t.risultatoSx || t.risultatoDx) return avg(t.risultatoSx, t.risultatoDx);
  if (t.risultato) { const v = parseFloat(t.risultato); return isNaN(v) ? null : v; }
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
  // badge stato — larghezza dinamica, verde se Disponibile
  const badgeColor: [number, number, number] = atleta.stato === "Disponibile" ? [34, 139, 34] : red;
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
  const stateTextW = doc.getStringUnitWidth(atleta.stato) * 7.5 / doc.internal.scaleFactor;
  const badgeW = Math.max(stateTextW + 12, 36);
  const badgeX = W - M - badgeW;
  doc.setFillColor(...badgeColor); doc.roundedRect(badgeX, HDR + 7, badgeW, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(atleta.stato, badgeX + badgeW / 2, HDR + 13, { align: "center" });
  doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(M, HDR + 27, W - M, HDR + 27);

  const fmtDCl = (d: string) => new Date(d + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const ggCl = (inizio: string, fine?: string) => fine
    ? `${Math.round((new Date(fine + "T12:00").getTime() - new Date(inizio + "T12:00").getTime()) / 86400000)}gg`
    : "—";

  const tuttiInfortuni: Array<{ id: string; tipo?: string; diagnosi: string; inizio: string; fine?: string; squadraDate?: string; osiicsCodice?: string }> = [];
  if (atleta.stato === "Infortunato" && (atleta.infortunio || atleta.inizioRehab))
    tuttiInfortuni.push({ id: "__corrente__", tipo: atleta.tipoInfortunio, diagnosi: atleta.infortunio || "—", inizio: atleta.inizioRehab, fine: atleta.fineRehab, osiicsCodice: atleta.osiicsCodice });
  (atleta.storicoInfortuni ?? []).forEach((s) =>
    tuttiInfortuni.push({ id: s.id, tipo: s.tipo, diagnosi: s.diagnosi, inizio: s.inizioRehab, fine: s.fineRehab, osiicsCodice: s.osiicsCodice })
  );
  // Ordine cronologico: dal più vecchio al più recente; dedup per entrate duplicate
  tuttiInfortuni.sort((a, b) => (a.inizio ?? "").localeCompare(b.inizio ?? ""));
  const _seenInf = new Set<string>();
  tuttiInfortuni.splice(0, tuttiInfortuni.length, ...tuttiInfortuni.filter((inf) => {
    const key = `${inf.diagnosi}|${inf.inizio ?? ""}|${inf.fine ?? ""}`;
    if (_seenInf.has(key)) return false;
    _seenInf.add(key);
    return true;
  }));
  tuttiInfortuni.forEach((inf) => {
    const sq = programmi
      .filter((p) => {
        if (!p.squadra || !p.data) return false;
        if (p.infortunioId) return p.infortunioId === inf.id;
        return !!(inf.inizio && p.data >= inf.inizio && (!inf.fine || p.data <= inf.fine));
      })
      .sort((a, b) => a.data.localeCompare(b.data))[0];
    inf.squadraDate = sq?.data ?? "";
  });

  let y = HDR + 34;
  y = secTitle("Dati clinici", y);
  autoTable(doc, {
    startY: y,
    body: [
      ["Piede dominante", atleta.piedeDominante || "—"],
      ["Stato attuale", atleta.stato],
      ...(atleta.osiicsCodice ? [["Codice OSIICS", `${atleta.osiicsCodice}${atleta.osiicsDescrizione ? ` – ${atleta.osiicsDescrizione}` : ""}`]] : []),
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
      head: [["#", "Tipo", "Diagnosi / Infortunio", "Inizio", "Fine", "Ritorno\nsquadra", "Giorni"]],
      body: tuttiInfortuni.map((inf, i) => [
        i + 1,
        inf.tipo ?? "—",
        inf.osiicsCodice ? `${inf.diagnosi} [${inf.osiicsCodice}]` : inf.diagnosi,
        inf.inizio ? fmtDCl(inf.inizio) : "—",
        inf.fine ? fmtDCl(inf.fine) : "—",
        inf.squadraDate ? fmtDCl(inf.squadraDate) : "—",
        inf.inizio ? ggCl(inf.inizio, inf.fine) : "—",
      ]),
      headStyles: { fillColor: dark, textColor: 255, fontSize: 7, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 8, cellPadding: 3, halign: "left", valign: "middle" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: M, right: M },
      columnStyles: {
        0: { cellWidth: 8 }, 1: { cellWidth: 55 }, 2: { cellWidth: 120 },
        3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 25 }, 6: { cellWidth: 17 },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 5 && data.cell.raw !== "—") {
          data.cell.styles.fillColor = [187, 247, 208];
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (atleta.note) {
    y = secTitle("Note", y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...dark);
    doc.text(doc.splitTextToSize(atleta.note, W - M * 2), M, y);
  }

  // ── Sessioni: una sezione per infortunio ────────────────────────────────────
  if (programmi.length > 0) {
    const usedProgIds = new Set<string>();

    const getMonday = (dateStr: string): string => {
      const d = new Date(dateStr + "T12:00");
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d); mon.setDate(diff);
      return mon.toISOString().slice(0, 10);
    };

    const renderSessions = (sectionLabel: string, injProgs: Programma[]) => {
      if (injProgs.length === 0) return;
      doc.addPage();
      addHeader(`${nd(atleta)}  ·  ${atleta.categoria}`);
      y = HDR + 8;
      const sessioniCount = injProgs.filter(p => !p.riposo).length;
      y = secTitle(`${sectionLabel}  —  ${sessioniCount} sessioni`, y);

      const sorted = [...injProgs].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
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
      const squadraRowIndices = new Set<number>();

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
        body.push([{ content: weekLabel, colSpan: 12 }]);
        subHeaderRowIndices.add(body.length);
        body.push(["Data", "Programma", "Fase", "Fisio", "Obiettivi\nPalestra", "Esercizi\nPalestra", "VAS", "Obiettivi\nCampo", "Esercizi\nCampo", "GPS", "VAS\nCampo", "RPE"]);

        let dataRowCount = 0;
        for (const prog of wkProgs) {
          const isAlt = dataRowCount % 2 === 1;
          const dataStr = prog.data ? fmtDCl(prog.data) : "—";
          const obP = prog.obiettiviPalestra?.length ? prog.obiettiviPalestra.map(o => `- ${o}`).join("\n") : "—";
          const obCampo = prog.obiettiviCampo?.length ? prog.obiettiviCampo.map(o => `- ${o}`).join("\n") : "—";
          const esC = (prog.esercizicampo ?? []).map((c, i) => {
            const parts = [c.tipo, c.serie ? `${c.serie}×` : "", c.durata || ""].filter(Boolean);
            return `${i + 1}. ${parts.join(" ")}`;
          }).join("\n") || "—";
          const vasC = (prog.esercizicampo ?? []).map((c, i) => `${i + 1}. ${c.vas || "0"}`).join("\n") || "—";
          const esercizi = prog.esercizi ?? [];

          const testLines = (prog.tests ?? []).map((t) => {
            const isSL = t.nome === "SL Drop Jump";
            const val = [t.risultato, t.risultatoSx ? `Sx ${t.risultatoSx}` : "", t.risultatoDx ? `Dx ${t.risultatoDx}` : "", t.tempo ? `Tempo: ${t.tempo}s` : "", t.livello ? `Liv: ${t.livello}` : "", t.vo2max ? `Vo2Max: ${t.vo2max}` : "", t.vam ? `VAM: ${t.vam}` : "", t.ginocchioDx ? `Gin.Dx: ${t.ginocchioDx}°` : "", t.ancaSx ? `Anca Sx: ${t.ancaSx}°` : "", t.diffGinocchioDxAncaSx ? `Δ: ${t.diffGinocchioDxAncaSx}°` : "", t.ginocchioSx ? `Gin.Sx: ${t.ginocchioSx}°` : "", t.ancaDx ? `Anca Dx: ${t.ancaDx}°` : "", t.diffGinocchioSxAncaDx ? `Δ: ${t.diffGinocchioSxAncaDx}°` : ""].filter(Boolean).join(" / ");
            const extras: string[] = [];
            const sxV = isSL ? (t.rsiSx ?? "") : (t.risultatoSx ?? "");
            const dxV = isSL ? (t.rsiDx ?? "") : (t.risultatoDx ?? "");
            const asim = _calcolaAsimmetria(sxV, dxV);
            const sup = _superioreTest(sxV, dxV);
            if (asim !== null && sup !== null) extras.push(`${sup} +${asim.toFixed(1)}%`);
            const prev = _trovaPrecedenteTest(programmi, prog.id, t.nome);
            const delta = t.nome === "QSLS" ? null : _calcolaDelta(t, prev);
            if (delta !== null) extras.push(`${delta >= 0 ? "↑" : "↓"} ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`);
            return `${t.nome}${val ? `: ${val}` : ""}${extras.length ? ` [${extras.join(", ")}]` : ""}`;
          });
          const tests = testLines.join("\n") || "—";
          void tests;

          if (prog.assente) {
            absenteRowIndices.add(body.length);
            body.push([dataStr, prog.nome ?? "—", { content: "ASSENTE" + (prog.noteAssenza ? `\n${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
            dataRowCount++;
            continue;
          }

          if (prog.riposo) {
            riposoRowIndices.add(body.length);
            body.push([dataStr, prog.nome ?? "—", { content: "RIPOSO" + (prog.noteAssenza ? `\n${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
            continue;
          }

          if (prog.squadra) {
            squadraRowIndices.add(body.length);
            body.push([dataStr, prog.nome ?? "—", { content: "RITORNO IN SQUADRA" + (prog.noteAssenza ? `  ·  ${prog.noteAssenza}` : ""), colSpan: 10, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
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
          ].filter(Boolean).map((s) => `- ${s}`).join("\n") || "—";

          const esText = esercizi.map((e, i) => { const metric = e.reps || e.durata; const sx = [e.serie, metric].filter(Boolean).join("×"); const carico = e.carico ? ` (${e.carico})` : ""; return `${i + 1}. ${sx ? `${e.nome} ${sx}${carico}` : e.nome}`; }).join("\n") || "—";
          const vasText = esercizi.map((e, i) => `${i + 1}. ${e.vas || "0"}`).join("\n") || "—";
          const fisio = prog.noteFisioterapia?.trim() || "—";
          if (isAlt) altRowIndices.add(body.length);
          body.push([dataStr, prog.nome ?? "—", prog.fase ?? "—", fisio, obP, esText, vasText, obCampo, esC, gps, vasC, rpe]);
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
          1:  { cellWidth: 28 },
          2:  { cellWidth: 11 },
          3:  { cellWidth: 32 },
          4:  { cellWidth: 26 },
          5:  { cellWidth: 31 },
          6:  { cellWidth: 13, halign: "center" as const },
          7:  { cellWidth: 28 },
          8:  { cellWidth: 40 },
          9:  { cellWidth: 24 },
          10: { cellWidth: 11, halign: "center" as const },
          11: { cellWidth: 10, halign: "center" as const },
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
    };

    // Data di inizio del primo infortunio concorrente attivo: serve per limitare
    // il date-range del __corrente__ ed evitare di catturare sessioni del concorrente
    const concCurrentStart = (atleta.storicoInfortuni ?? [])
      .filter(s => s.attivo === true && s.inizioRehab)
      .map(s => s.inizioRehab)
      .sort()[0] ?? "";

    // Una sezione per infortunio
    for (const inj of tuttiInfortuni) {
      const injProgs = programmi.filter((p) => {
        if (usedProgIds.has(p.id)) return false;
        if (inj.id === "__corrente__") {
          if (p.infortunioId === "__corrente__") return true;
          if (!p.infortunioId && p.data && inj.inizio && p.data >= inj.inizio) {
            // Cap al primo inizio concorrente per non rubare sessioni senza infortunioId
            const endBound = inj.fine || concCurrentStart;
            if (!endBound || p.data < endBound) return true;
          }
        } else {
          if (p.infortunioId === inj.id) return true;
          if (p.infortunioId === "__corrente__" && atleta.stato !== "Infortunato" && p.data && inj.inizio && p.data >= inj.inizio && (!inj.fine || p.data <= inj.fine)) return true;
          if (!p.infortunioId && p.data && inj.inizio && p.data >= inj.inizio && (!inj.fine || p.data <= inj.fine)) return true;
        }
        return false;
      });
      injProgs.forEach((p) => usedProgIds.add(p.id));
      const label = [inj.diagnosi, inj.tipo].filter(Boolean).join("  ·  ");
      renderSessions(label, injProgs);
    }

    // Sessioni non abbinate a nessun infortunio
    const unmatchedProgs = programmi.filter((p) => !usedProgIds.has(p.id));
    if (unmatchedProgs.length > 0) {
      renderSessions("Sessioni non associate", unmatchedProgs);
    }
  }

  // ── Andamento Test ────────────────────────────────────────────────────────
  const testProgs = programmi
    .filter((p) => !p.assente && !p.riposo && (p.tests?.length ?? 0) > 0)
    .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));

  if (testProgs.length > 0) {
    const testsByName: Record<string, Array<{ dateLabel: string; dateFull: string; test: TestFisiometrico }>> = {};
    for (const prog of testProgs) {
      for (const t of prog.tests ?? []) {
        if (!t.nome) continue;
        if (!testsByName[t.nome]) testsByName[t.nome] = [];
        testsByName[t.nome].push({
          dateLabel: prog.data ? new Date(prog.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "—",
          dateFull: prog.data ? new Date(prog.data + "T12:00").toLocaleDateString("it-IT") : "—",
          test: t,
        });
      }
    }

    const testNames = Object.keys(testsByName);
    if (testNames.length > 0) {
      doc.addPage();
      addHeader(`${nd(atleta)}  ·  ${atleta.categoria}`);
      let y = HDR + 8;
      y = secTitle("Test", y);

      const checkPg = (needed: number) => {
        if (y + needed > H - 18) {
          doc.addPage();
          addHeader(`${nd(atleta)}  ·  ${atleta.categoria}`);
          y = HDR + 8;
        }
      };

      // Tabella sx + grafico dx affiancati; colori alternati rosso/grigio
      const TEST_TABLE_W = 110;
      const TEST_CHART_X = M + TEST_TABLE_W + 8;
      const TEST_CHART_W = W - M - TEST_CHART_X;

      testNames.forEach((testName, testIdx) => {
        const entries = testsByName[testName];
        const isSprintTempo = ["Sprint 10m", "Sprint 20m", "Sprint 30m", "10x100m"].includes(testName);
        const isGaconIFT = testName === "Gacon" || testName === "IFT 30-15";
        const isDropJump = testName === "Drop Jump";
        const isSLDropJump = testName === "SL Drop Jump";
        const isJurdan = testName === "Jurdan";
        const isCMJLike = (testName.includes("CMJ") && !testName.includes("SL")) || testName === "Squat Jump";
        const isBroadJump = testName.includes("Broad Jump");
        const hasSxDx = !isJurdan && !isCMJLike && !isBroadJump && entries.some((e) => e.test.risultatoSx || e.test.risultatoDx);

        const color: [number, number, number] = testIdx % 2 === 0 ? [200, 16, 46] : [75, 85, 99];
        const [cr, cg, cb] = color;

        const mainData = entries
          .map((e) => { const v = getTestMainValue(e.test); return v !== null ? { dateLabel: e.dateLabel, value: v } : null; })
          .filter((d): d is { dateLabel: string; value: number } => d !== null);

        const hasChart = mainData.length >= 2;
        const tableRows = entries.length;
        const needed = 9 + Math.max(8 + tableRows * 5.5, hasChart ? 49 : 0) + 6;
        checkPg(needed);

        // Titolo test: grassetto nero corsivo, nessuna banda
        doc.setFont("helvetica", "bolditalic"); doc.setFontSize(8); doc.setTextColor(20, 20, 20);
        doc.text(testName, M, y + 5);
        y += 9;
        const contentStartY = y;

        // Tabella dati (sinistra)
        let head: string[];
        let tableBody: string[][];

        if (isDropJump) {
          head = ["Data", "Altezza (cm)", "Contatto (s)", "RSI"];
          tableBody = entries.map((e) => [e.dateFull, e.test.altezzaSalto || "—", e.test.tempoContatto || "—", e.test.rsi || "—"]);
        } else if (isSLDropJump) {
          head = ["Data", "RSI Sx", "RSI Dx", "Asimmetria %"];
          tableBody = entries.map((e) => {
            const asim = _calcolaAsimmetria(e.test.rsiSx ?? "", e.test.rsiDx ?? "");
            return [e.dateFull, e.test.rsiSx || "—", e.test.rsiDx || "—", asim !== null ? `${asim.toFixed(1)}%` : "—"];
          });
        } else if (isSprintTempo) {
          head = ["Data", "Tempo (s)"];
          tableBody = entries.map((e) => [e.dateFull, e.test.tempo || "—"]);
        } else if (isGaconIFT) {
          head = ["Data", "Livello", "Vo2Max (ml/kg/min)", "VAM (km/h)"];
          tableBody = entries.map((e) => [e.dateFull, e.test.livello || "—", e.test.vo2max || "—", e.test.vam || "—"]);
        } else if (isJurdan) {
          head = ["Data", "Gin.Dx (°)", "Anca Sx (°)", "Δ Dx/Sx (°)", "Gin.Sx (°)", "Anca Dx (°)", "Δ Sx/Dx (°)"];
          tableBody = entries.map((e) => {
            const gDx = parseFloat(e.test.ginocchioDx ?? ""), aSx = parseFloat(e.test.ancaSx ?? "");
            const gSx = parseFloat(e.test.ginocchioSx ?? ""), aDx = parseFloat(e.test.ancaDx ?? "");
            const d1 = e.test.diffGinocchioDxAncaSx ?? ((!isNaN(gDx) && !isNaN(aSx)) ? Math.abs(gDx - aSx).toFixed(1) : "—");
            const d2 = e.test.diffGinocchioSxAncaDx ?? ((!isNaN(gSx) && !isNaN(aDx)) ? Math.abs(gSx - aDx).toFixed(1) : "—");
            return [e.dateFull, e.test.ginocchioDx || "—", e.test.ancaSx || "—", d1, e.test.ginocchioSx || "—", e.test.ancaDx || "—", d2];
          });
        } else if (isCMJLike) {
          head = ["Data", "Altezza (cm)"];
          tableBody = entries.map((e) => [e.dateFull, e.test.altezzaSalto || "—"]);
        } else if (isBroadJump) {
          head = ["Data", "Distanza (cm)"];
          tableBody = entries.map((e) => [e.dateFull, e.test.altezzaSalto || "—"]);
        } else if (hasSxDx) {
          const isQSLS = testName === "QSLS";
          const unitSx = entries[0]?.test.unita ? ` (${entries[0].test.unita})` : "";
          head = isQSLS
            ? ["Data", `Arto Sx${unitSx}`, `Arto Dx${unitSx}`]
            : ["Data", `Arto Sx${unitSx}`, `Arto Dx${unitSx}`, "Asimmetria %"];
          tableBody = entries.map((e) => {
            if (isQSLS) return [e.dateFull, e.test.risultatoSx || "—", e.test.risultatoDx || "—"];
            const asim = _calcolaAsimmetria(e.test.risultatoSx, e.test.risultatoDx);
            return [e.dateFull, e.test.risultatoSx || "—", e.test.risultatoDx || "—", asim !== null ? `${asim.toFixed(1)}%` : "—"];
          });
        } else {
          head = ["Data", `Risultato${entries[0]?.test.unita ? ` (${entries[0].test.unita})` : ""}`];
          tableBody = entries.map((e) => [e.dateFull, e.test.risultato || "—"]);
        }

        const asimCol = (isSLDropJump || (hasSxDx && testName !== "QSLS")) ? 3 : -1;
        autoTable(doc, {
          startY: contentStartY,
          head: [head],
          body: tableBody,
          headStyles: { fillColor: color, textColor: [255, 255, 255] as [number, number, number], fontSize: 6.5, halign: "center" as const, valign: "middle" as const },
          bodyStyles: { fontSize: 7, cellPadding: 2, halign: "center" as const, valign: "middle" as const },
          alternateRowStyles: { fillColor: [250, 250, 250] as [number, number, number] },
          margin: { left: M, right: hasChart ? W - M - TEST_TABLE_W : M },
          columnStyles: {
            0: { halign: "left" as const, cellWidth: 26 },
            ...(asimCol !== -1 ? { [asimCol]: { cellWidth: 32, halign: "center" as const } } : {}),
          },
          didParseCell: (data: any) => {
            if (data.section === "body" && asimCol !== -1 && data.column.index === asimCol) {
              const v = parseFloat(String(data.cell.raw));
              if (!isNaN(v) && v > 10) {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = "bold";
              }
            }
          },
        });
        const tableEndY = (doc as any).lastAutoTable.finalY + 4;

        // Grafico andamento (destra)
        if (hasChart) {
          y = contentStartY;
          const cX = TEST_CHART_X; const cW = TEST_CHART_W; const cH = 40; const cY = y;
          doc.setFillColor(249, 250, 251); doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
          doc.rect(cX, cY, cW, cH, "FD");
          const n = mainData.length;
          const vals = mainData.map((d) => d.value);
          const minV = Math.min(...vals); const maxV = Math.max(...vals);
          const range = maxV - minV || 1;
          const PAD = { top: 6, right: 6, bottom: 9, left: 18 };
          const plotX = cX + PAD.left; const plotW = cW - PAD.left - PAD.right;
          const plotY = cY + PAD.top; const plotH = cH - PAD.top - PAD.bottom;

          for (let t = 0; t <= 4; t++) {
            const tv = minV + (range / 4) * t;
            const ty = plotY + plotH - (t / 4) * plotH;
            doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
            doc.line(plotX, ty, plotX + plotW, ty);
            doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
            doc.text(tv.toFixed(1), plotX - 1.5, ty + 1.5, { align: "right" });
          }
          const gX2 = (i: number) => plotX + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
          const gY2 = (v: number) => plotY + plotH - ((v - minV) / range) * plotH;

          const lr = Math.round(cr * 0.12 + 255 * 0.88);
          const lg = Math.round(cg * 0.12 + 255 * 0.88);
          const lb = Math.round(cb * 0.12 + 255 * 0.88);
          doc.setFillColor(lr, lg, lb);
          const botY2 = plotY + plotH;
          const segs: [number, number][] = [[0, gY2(mainData[0].value) - botY2]];
          for (let i = 1; i < n; i++) segs.push([gX2(i) - gX2(i - 1), gY2(mainData[i].value) - gY2(mainData[i - 1].value)]);
          segs.push([0, botY2 - gY2(mainData[n - 1].value)]);
          segs.push([gX2(0) - gX2(n - 1), 0]);
          (doc as any).lines(segs, gX2(0), botY2, [1, 1], "F", true);

          const avg = vals.reduce((a, b) => a + b, 0) / n;
          doc.setDrawColor(...gray); doc.setLineWidth(0.4); doc.setLineDashPattern([1.5, 1.5], 0);
          doc.line(plotX, gY2(avg), plotX + plotW, gY2(avg));
          doc.setLineDashPattern([], 0);

          doc.setDrawColor(...color); doc.setLineWidth(0.9);
          for (let i = 0; i < n - 1; i++) doc.line(gX2(i), gY2(mainData[i].value), gX2(i + 1), gY2(mainData[i + 1].value));
          doc.setFillColor(...color); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4);
          mainData.forEach((d, i) => doc.circle(gX2(i), gY2(d.value), i === n - 1 ? 1.3 : 1, "FD"));

          doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
          const step = n <= 15 ? 1 : Math.ceil(n / 15);
          mainData.forEach((d, i) => { if (i % step === 0) doc.text(d.dateLabel, gX2(i), cY + cH + 4, { align: "center" }); });

          const yLbl = isSprintTempo ? "Tempo (s)" : isGaconIFT ? "Vo2Max (ml/kg/min)" : isDropJump ? "RSI" : isSLDropJump ? "RSI medio" : isJurdan ? "Gin.Dx (°)" : hasSxDx ? "Media Sx/Dx" : "Valore";
          doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...color);
          doc.text(yLbl, plotX, plotY - 1.5);

          y = Math.max(tableEndY, contentStartY + cH + 9);
        } else {
          y = tableEndY;
        }
        y += 6;
      });
    }
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
  rows.push(["Nome", "Categoria", "Infortunio", "Tipo", "Codice OSIICS", "Inizio", "Fine", "Giorni", "Stato"]);

  atletiMese.forEach(a => {
    const infortuni = infortunitNelPeriodo(a, mesiP ?? [{ anno, mese }]);
    if (infortuni.length === 0) {
      rows.push([nd(a), a.categoria ?? "—", "—", "—", "—", "—", "—", "—", a.stato]);
    } else {
      infortuni.forEach(inf => {
        rows.push([nd(a), a.categoria ?? "—", inf.diagnosi, inf.tipo ?? "—", inf.osiicsCodice ?? "—", inf.inizio ? fmt(inf.inizio) : "—", inf.fine ? fmt(inf.fine) : "—", inf.inizio ? gg(inf.inizio, inf.fine) : "—", inf.fine ? "Recuperato" : a.stato]);
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
        row.push(
          inf.osiicsCodice ? `${inf.diagnosi} [${inf.osiicsCodice}]` : inf.diagnosi,
          (inf.tipo ?? "—").replace(/\//g, "/ "),
          inf.meccanismo || "—",
          inf.note || "—",
        );
        row.push(
          inf.inizio ? fmtDP(inf.inizio) : "—",
          inf.fine ? fmtDP(inf.fine) : "—",
          inf.inizio ? ggP(inf.inizio, inf.fine) : "—",
          inf.fine ? "Recuperato" : a.stato,
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
  if (meseStart > new Date()) return false;
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

type InfortunioNelMese = { diagnosi: string; tipo?: string; inizio: string; fine?: string; meccanismo?: string; note?: string; osiicsCodice?: string };
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
    result.push({ diagnosi: a.infortunio, tipo: a.tipoInfortunio, inizio: a.inizioRehab, fine: a.fineRehab, meccanismo: a.meccanismo, note: a.note || undefined, osiicsCodice: a.osiicsCodice });
  (a.storicoInfortuni ?? []).forEach((s) => {
    if (inMese(s.inizioRehab, s.fineRehab))
      result.push({ diagnosi: s.diagnosi, tipo: s.tipo, inizio: s.inizioRehab, fine: s.fineRehab, meccanismo: s.meccanismo, note: s.note, osiicsCodice: s.osiicsCodice });
  });
  const fmtK = (d?: string) => {
    if (!d) return "";
    const p = new Date(d + "T12:00");
    return isNaN(p.getTime()) ? d : p.toLocaleDateString("it-IT");
  };
  const seen = new Set<string>();
  return result.filter((inf) => {
    const key = `${inf.diagnosi}|${inf.tipo ?? ""}|${fmtK(inf.inizio)}|${fmtK(inf.fine)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function Sparkline({ values, invert = false }: { values: number[]; invert?: boolean }) {
  if (values.length < 2) return null;
  const plotVals = invert ? values.map(v => -v) : values;
  const min = Math.min(...plotVals), max = Math.max(...plotVals);
  const range = max - min || 1;
  const W = 240, H = 52, pX = 6, pY = 6;
  const iW = W - pX * 2, iH = H - pY * 2;
  const pts: [number, number][] = plotVals.map((v, i) => [pX + (i / (plotVals.length - 1)) * iW, pY + iH - ((v - min) / range) * iH]);
  const line = "M " + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");
  const area = `${line} L ${(pX + iW).toFixed(1)},${(pY + iH).toFixed(1)} L ${pX},${(pY + iH).toFixed(1)} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id="sk-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C8102E" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#C8102E" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sk-grad)" />
      <path d={line} fill="none" stroke="#C8102E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3.5 : 2.5}
          fill="#C8102E" stroke="white" strokeWidth={i === pts.length - 1 ? 1.5 : 0} />
      ))}
    </svg>
  );
}

export default function ProgressiPage() {
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [programmi, setProgrammi] = useState<Programma[]>([]);
  const [esportando, setEsportando] = useState<string | null>(null);
  const [expandedTestsId, setExpandedTestsId] = useState<string | null>(null);
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
              const nProg = programmi.filter((p) => p.atletaId === atleta.id && !p.riposo).length;
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

                  {/* ── Andamento test ── */}
                  {(() => {
                    const atletaProgs = programmi
                      .filter((p) => p.atletaId === atleta.id && !p.assente && !p.riposo && (p.tests?.length ?? 0) > 0)
                      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
                    const testsByName: Record<string, Array<{ data: string; test: TestFisiometrico }>> = {};
                    for (const prog of atletaProgs) {
                      for (const t of prog.tests ?? []) {
                        if (!t.nome) continue;
                        if (!testsByName[t.nome]) testsByName[t.nome] = [];
                        testsByName[t.nome].push({ data: prog.data ?? "", test: t });
                      }
                    }
                    const testNames = Object.keys(testsByName);
                    if (!testNames.length) return null;
                    const isOpen = expandedTestsId === atleta.id;
                    const fmtD = (d: string) => d ? new Date(d + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
                    return (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <button onClick={() => setExpandedTestsId(isOpen ? null : atleta.id)}
                          className="flex items-center gap-2 w-full text-left">
                          <FlaskConical className="w-4 h-4 text-[#C8102E] shrink-0" />
                          <span className="text-sm font-semibold text-gray-700">Andamento test</span>
                          <span className="text-xs text-gray-400 ml-1">({testNames.length} test)</span>
                          <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isOpen && (
                          <div className="mt-4 space-y-5">
                            {testNames.map((testName, testIdx) => {
                              const entries = testsByName[testName];
                              const isSprintTempo = ["Sprint 10m", "Sprint 20m", "Sprint 30m", "10x100m"].includes(testName);
                              const isGaconIFT = testName === "Gacon" || testName === "IFT 30-15";
                              const isDropJump = testName === "Drop Jump";
                              const isSLDropJump = testName === "SL Drop Jump";
                              const isJurdan = testName === "Jurdan";
                              const isCMJ = testName === "CMJ – Counter Movement Jump" || testName === "CMJ braccia libere" || testName === "Squat Jump";
                              const isBroadJump = testName === "Broad Jump";
                              const isQSLS = testName === "QSLS";
                              const hasSxDx = !isJurdan && !isCMJ && !isBroadJump && entries.some((e) => e.test.risultatoSx || e.test.risultatoDx);
                              const chartVals = entries.map((e) => getTestMainValue(e.test)).filter((v): v is number => v !== null);
                              const thBg = testIdx % 2 === 0 ? "bg-[#C8102E]" : "bg-[#4B5563]";
                              return (
                                <div key={testName} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                                  <h4 className="text-sm font-bold italic text-gray-900 mb-3">{testName}</h4>
                                  {chartVals.length >= 2 && (
                                    <div className="mb-3 flex items-center gap-4">
                                      <Sparkline values={chartVals} invert={isSprintTempo} />
                                      <div className="text-xs text-gray-400 space-y-1">
                                        {(() => {
                                          const first = chartVals[0], last = chartVals[chartVals.length - 1];
                                          const pct = first > 0 ? ((last - first) / first) * 100 : null;
                                          const isGood = pct !== null && Math.abs(pct) >= 10 && (isSprintTempo ? pct < 0 : pct > 0);
                                          const isBad = pct !== null && Math.abs(pct) >= 10 && (isSprintTempo ? pct > 0 : pct < 0);
                                          return pct !== null ? (
                                            <span className={`text-sm font-bold ${isGood ? "text-green-600" : isBad ? "text-red-500" : "text-gray-400"}`}>
                                              {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                                            </span>
                                          ) : null;
                                        })()}
                                        <p className="text-gray-400">{entries.length} rilevazioni</p>
                                      </div>
                                    </div>
                                  )}
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className={`${thBg} text-white`}>
                                          <th className="text-left py-2 px-2 font-semibold">Data</th>
                                          {isSprintTempo && <th className="text-right py-2 px-2 font-semibold">Tempo (s)</th>}
                                          {isGaconIFT && <>
                                            <th className="text-right py-2 px-2 font-semibold">Livello</th>
                                            <th className="text-right py-2 px-2 font-semibold">Vo2Max</th>
                                            <th className="text-right py-2 px-2 font-semibold">VAM (km/h)</th>
                                          </>}
                                          {isDropJump && <>
                                            <th className="text-right py-2 px-2 font-semibold">Alt. (cm)</th>
                                            <th className="text-right py-2 px-2 font-semibold">Contatto (s)</th>
                                            <th className="text-right py-2 px-2 font-semibold">RSI</th>
                                          </>}
                                          {isCMJ && <th className="text-right py-2 px-2 font-semibold">Altezza (cm)</th>}
                                          {isBroadJump && <th className="text-right py-2 px-2 font-semibold">Distanza (cm)</th>}
                                          {isSLDropJump && <>
                                            <th className="text-right py-2 px-2 font-semibold">RSI Sx</th>
                                            <th className="text-right py-2 px-2 font-semibold">RSI Dx</th>
                                            <th className="text-right py-2 px-2 font-semibold">Asim%</th>
                                          </>}
                                          {isJurdan && <>
                                            <th className="text-right py-2 px-2 font-semibold">Gin.Dx (°)</th>
                                            <th className="text-right py-2 px-2 font-semibold">Anca Sx (°)</th>
                                            <th className="text-right py-2 px-2 font-semibold">Δ Dx/Sx</th>
                                            <th className="text-right py-2 px-2 font-semibold">Gin.Sx (°)</th>
                                            <th className="text-right py-2 px-2 font-semibold">Anca Dx (°)</th>
                                            <th className="text-right py-2 px-2 font-semibold">Δ Sx/Dx</th>
                                          </>}
                                          {!isSprintTempo && !isGaconIFT && !isDropJump && !isSLDropJump && !isJurdan && hasSxDx && <>
                                            <th className="text-right py-2 px-2 font-semibold">Sx</th>
                                            <th className="text-right py-2 px-2 font-semibold">Dx</th>
                                            {!isQSLS && <th className="text-right py-2 px-2 font-semibold">Asim%</th>}
                                          </>}
                                          {!isSprintTempo && !isGaconIFT && !isDropJump && !isSLDropJump && !isJurdan && !isCMJ && !isBroadJump && !hasSxDx && (
                                            <th className="text-right py-2 px-2 font-semibold">Risultato</th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entries.map((e, i) => {
                                          const asim = isSLDropJump
                                            ? _calcolaAsimmetria(e.test.rsiSx ?? "", e.test.rsiDx ?? "")
                                            : isQSLS ? null : _calcolaAsimmetria(e.test.risultatoSx, e.test.risultatoDx);
                                          const isLast = i === entries.length - 1;
                                          return (
                                            <tr key={i} className={`border-b border-gray-100 ${isLast ? "font-semibold" : ""}`}>
                                              <td className="py-2 px-2 text-gray-600">{fmtD(e.data)}</td>
                                              {isSprintTempo && (
                                                <td className="py-2 px-2 text-right font-mono">{e.test.tempo || "—"}</td>
                                              )}
                                              {isGaconIFT && <>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.livello || "—"}</td>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.vo2max || "—"}</td>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.vam || "—"}</td>
                                              </>}
                                              {isDropJump && <>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.altezzaSalto || "—"}</td>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.tempoContatto || "—"}</td>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.rsi || "—"}</td>
                                              </>}
                                              {(isCMJ || isBroadJump) && (
                                                <td className="py-2 px-2 text-right font-mono">{e.test.altezzaSalto || "—"}</td>
                                              )}
                                              {isSLDropJump && <>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.rsiSx || "—"}</td>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.rsiDx || "—"}</td>
                                                <td className={`py-2 px-2 text-right font-mono font-semibold ${asim !== null && asim > 10 ? "text-red-600" : "text-gray-600"}`}>
                                                  {asim !== null ? `${asim.toFixed(1)}%` : "—"}
                                                </td>
                                              </>}
                                              {isJurdan && (() => {
                                                const gDx = parseFloat(e.test.ginocchioDx ?? ""), aSx = parseFloat(e.test.ancaSx ?? "");
                                                const gSx = parseFloat(e.test.ginocchioSx ?? ""), aDx = parseFloat(e.test.ancaDx ?? "");
                                                const d1 = e.test.diffGinocchioDxAncaSx ?? ((!isNaN(gDx) && !isNaN(aSx)) ? Math.abs(gDx - aSx).toFixed(1) : "—");
                                                const d2 = e.test.diffGinocchioSxAncaDx ?? ((!isNaN(gSx) && !isNaN(aDx)) ? Math.abs(gSx - aDx).toFixed(1) : "—");
                                                return (<>
                                                  <td className="py-2 px-2 text-right font-mono">{e.test.ginocchioDx || "—"}</td>
                                                  <td className="py-2 px-2 text-right font-mono">{e.test.ancaSx || "—"}</td>
                                                  <td className="py-2 px-2 text-right font-mono text-gray-500">{d1}</td>
                                                  <td className="py-2 px-2 text-right font-mono">{e.test.ginocchioSx || "—"}</td>
                                                  <td className="py-2 px-2 text-right font-mono">{e.test.ancaDx || "—"}</td>
                                                  <td className="py-2 px-2 text-right font-mono text-gray-500">{d2}</td>
                                                </>);
                                              })()}
                                              {!isSprintTempo && !isGaconIFT && !isDropJump && !isSLDropJump && !isJurdan && hasSxDx && <>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.risultatoSx || "—"}{e.test.unita ? ` ${e.test.unita}` : ""}</td>
                                                <td className="py-2 px-2 text-right font-mono">{e.test.risultatoDx || "—"}{e.test.unita && e.test.risultatoDx ? ` ${e.test.unita}` : ""}</td>
                                                {!isQSLS && <td className={`py-2 px-2 text-right font-mono font-semibold ${asim !== null && asim > 10 ? "text-red-600" : "text-gray-600"}`}>
                                                  {asim !== null ? `${asim.toFixed(1)}%` : "—"}
                                                </td>}
                                              </>}
                                              {!isSprintTempo && !isGaconIFT && !isDropJump && !isSLDropJump && !isJurdan && !isCMJ && !isBroadJump && !hasSxDx && (
                                                <td className="py-2 px-2 text-right font-mono">{e.test.risultato || "—"}{e.test.unita ? ` ${e.test.unita}` : ""}</td>
                                              )}
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
