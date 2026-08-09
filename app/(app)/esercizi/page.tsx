"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X, ChevronDown, Edit2, Gauge, Upload, AlertTriangle, Footprints, CalendarX2, Users, BatteryFull, FileText, FileDown, ShieldPlus, TrendingUp, Dumbbell } from "lucide-react";
import {
  loadAtleti, loadProgrammi, upsertProgramma, upsertAtleta, deleteProgramma, uid, nd, calcolaProgressoAuto,
  subscribeToAtleti, subscribeToProgrammi,
  TESTS_PREDEFINITI, OBIETTIVI_PALESTRA, OBIETTIVI_CAMPO,
  type Atleta, type Programma, type Esercizio, type TestFisiometrico, type Carico, type EsercizioCampo, type InfortunioStorico,
} from "@/lib/store";

const esVuoto: Esercizio = { nome: "", serie: "", reps: "", durata: "", carico: "", rir: "", vas: "", note: "" };
const testVuoto: TestFisiometrico = { nome: "", risultatoSx: "", risultatoDx: "", risultato: "", unita: "", note: "" };
const caricoVuoto: Carico = { rpe: "", interno: "", durata: "", distanzaTotale: "", velocitaMax: "", hsr: "", velocita21: "", velocita25: "", accelerazioni: "", decelerazioni: "", sprint: "", potenzaMetabolica: "", note: "" };
const campoVuoto: EsercizioCampo = { tipo: "", serie: "", durata: "", descrizione: "", vas: "" };

const progVuoto: Omit<Programma, "id"> = {
  atletaId: "", nome: "", fase: "",
  data: new Date().toISOString().slice(0, 10),
  esercizi: [],
  esercizicampo: [],
  obiettiviPalestra: [],
  obiettiviCampo: [],
  tests: [],
  carico: { ...caricoVuoto },
  assente: false,
  riposo: false,
  squadra: false,
  noteAssenza: "",
  noteFisioterapia: "",
};

function ScaleInput({ label, value, max, onChange, color }: {
  label: string; value: string; max: number; onChange: (v: string) => void; color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500 font-medium">{label}</span>
        <span className={`font-bold ${color}`}>{value || "—"}</span>
      </div>
      <input type="range" min={0} max={max} step={1} value={value || 0}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-1.5 rounded-full appearance-none accent-[#C8102E]" />
      <div className="flex justify-between text-xs text-gray-300 mt-0.5">
        <span>0</span><span>{max}</span>
      </div>
    </div>
  );
}

function calcolaAsimmetria(sx: string, dx: string): number | null {
  const a = parseFloat(sx), b = parseFloat(dx);
  if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) return null;
  return Math.abs(a - b) / Math.max(a, b) * 100;
}

function superioreTest(sx: string, dx: string): "Dx" | "Sx" | null {
  const a = parseFloat(sx), b = parseFloat(dx);
  if (isNaN(a) || isNaN(b) || a === b) return null;
  return b > a ? "Dx" : "Sx";
}

function trovaPrecedenteTest(lista: Programma[], currentId: string, nomeTest: string): import("@/lib/store").TestFisiometrico | null {
  const sorted = [...lista]
    .filter(p => !p.assente && !p.riposo && !p.squadra && p.tests?.length)
    .sort((a, b) => a.data.localeCompare(b.data));
  const idx = sorted.findIndex(p => p.id === currentId);
  if (idx <= 0) return null;
  for (let k = idx - 1; k >= 0; k--) {
    const found = (sorted[k].tests ?? []).find(tt => tt.nome === nomeTest);
    if (found) return found;
  }
  return null;
}

function calcolaDelta(curr: import("@/lib/store").TestFisiometrico, prev: import("@/lib/store").TestFisiometrico | null): number | null {
  if (!prev) return null;
  const avg = (vals: (string | undefined)[]) => {
    const ns = vals.map(v => parseFloat(v ?? "")).filter(v => !isNaN(v) && v > 0);
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : NaN;
  };
  // SL Drop Jump: RSI per limb average
  if (curr.rsiSx || curr.rsiDx) {
    const c = avg([curr.rsiSx, curr.rsiDx]), p = avg([prev.rsiSx, prev.rsiDx]);
    if (isNaN(c) || isNaN(p) || p <= 0) return null;
    return ((c - p) / p) * 100;
  }
  // Drop Jump: RSI
  if (curr.rsi && prev.rsi) {
    const c = parseFloat(curr.rsi), p = parseFloat(prev.rsi);
    if (isNaN(c) || isNaN(p) || p <= 0) return null;
    return ((c - p) / p) * 100;
  }
  // Bilateral (Sx + Dx)
  if (curr.risultatoSx || curr.risultatoDx) {
    const c = avg([curr.risultatoSx, curr.risultatoDx]);
    const p = avg([prev.risultatoSx, prev.risultatoDx]);
    if (isNaN(c) || isNaN(p) || p <= 0) return null;
    return ((c - p) / p) * 100;
  }
  // Single value
  if (curr.risultato && prev.risultato) {
    const c = parseFloat(curr.risultato), p = parseFloat(prev.risultato);
    if (isNaN(c) || isNaN(p) || p <= 0) return null;
    return ((c - p) / p) * 100;
  }
  return null;
}

async function getLogoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch("/logo.png"); if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onloadend = () => res(rd.result as string); rd.onerror = rej; rd.readAsDataURL(blob); });
  } catch { return null; }
}

async function esportaPDFGiornaliero(data: string, atleti: Atleta[], tuttiProgrammi: Programma[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const progDelGiorno = tuttiProgrammi.filter((p) => p.data === data);
  if (progDelGiorno.length === 0) return;

  const doc = new jsPDF({ orientation: "landscape" });
  const red: [number, number, number] = [200, 16, 46];
  const dark: [number, number, number] = [43, 43, 43];
  const gray: [number, number, number] = [130, 130, 130];
  const logoDataUrl = await getLogoDataUrl();
  const dataFmt = new Date(data + "T12:00").toLocaleDateString("it-IT");
  const dataConGiorno = (() => { const s = new Date(data + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); })();
  const M = 14; const W = 297; const H = 210; const HDR = 30;

  const addHeader = () => {
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, HDR, "F");
    doc.setFillColor(...red); doc.rect(0, 0, 3, HDR, "F");
    doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(0, HDR, W, HDR);
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 7, 4, 22, 22);
    const tx = logoDataUrl ? 33 : M;
    doc.setTextColor(...red); doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("U.S. Cremonese", tx, 14);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...dark);
    doc.text("Rehab Area – Programmi Giornalieri", tx, 19.5);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
    doc.text(dataConGiorno, tx, 24.5);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
    doc.text("Stagione 2026-2027", W - M, 14, { align: "right" });
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

  const body: any[] = [];
  const catRowIndices = new Set<number>();
  const absenteRowIndices = new Set<number>();
  const riposoRowIndices = new Set<number>();
  const squadraRowIndices = new Set<number>();
  const altRowIndices = new Set<number>();
  const testRows: { dataLabel: string; nomeAtleta: string; nomeTest: string; risultato: string }[] = [];

  const CATEGORIE_ORD = ["1ª Squadra", "U19", "U17", "U16", "U15", "U14", "Altra squadra", "Provino"];
  const perCategoria = new Map<string, { atleta: Atleta; prog: Programma }[]>();

  for (const prog of progDelGiorno) {
    const atleta = atleti.find((a) => a.id === prog.atletaId);
    if (!atleta) continue;
    const cat = atleta.categoria ?? "—";
    if (!perCategoria.has(cat)) perCategoria.set(cat, []);
    perCategoria.get(cat)!.push({ atleta, prog });
  }

  const categoriePres = CATEGORIE_ORD.filter((c) => perCategoria.has(c));
  const altreCategorie = Array.from(perCategoria.keys()).filter((c) => !CATEGORIE_ORD.includes(c)).sort();

  let dataRowCount = 0;
  for (const cat of [...categoriePres, ...altreCategorie]) {
    const lista = (perCategoria.get(cat) ?? []).sort((a, b) => nd(a.atleta).localeCompare(nd(b.atleta), "it"));
    catRowIndices.add(body.length);
    body.push([{ content: cat, colSpan: 12 }]);

    for (const { atleta, prog } of lista) {
      const nomeAtleta = nd(atleta);
      const isAlt = dataRowCount % 2 === 1;

      if (prog.assente) {
        absenteRowIndices.add(body.length);
        body.push([nomeAtleta, { content: "ASSENTE" + (prog.noteAssenza ? ` – ${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
        dataRowCount++; continue;
      }
      if (prog.riposo) {
        riposoRowIndices.add(body.length);
        body.push([nomeAtleta, { content: "RIPOSO" + (prog.noteAssenza ? ` – ${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
        dataRowCount++; continue;
      }
      if (prog.squadra) {
        squadraRowIndices.add(body.length);
        body.push([nomeAtleta, { content: "SQUADRA" + (prog.noteAssenza ? ` – ${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
        dataRowCount++; continue;
      }

      const obP = prog.obiettiviPalestra?.length ? prog.obiettiviPalestra.map(o => `- ${o.replace(/\//g, "/ ")}`).join("\n") : "—";
      const obCampo = prog.obiettiviCampo?.length ? prog.obiettiviCampo.map(o => `- ${o.replace(/\//g, "/ ")}`).join("\n") : "—";
      const esC = (prog.esercizicampo ?? []).map((c, i) => {
        const parts = [c.tipo, c.serie ? `${c.serie}×` : "", c.durata || ""].filter(Boolean);
        return `${i + 1}. ${parts.join(" ")}`;
      }).join("\n") || "—";
      const vasC = (() => { const items = (prog.esercizicampo ?? []).map((c: any, i: number) => ({ n: i + 1, v: c.vas })).filter(x => x.v && x.v !== "0"); return items.length ? items.map(x => `${x.n}. ${x.v}`).join("\n") : "—"; })();
      const rpe = prog.carico?.rpe ? `${prog.carico.rpe}/10` : "—";
      const esercizi = prog.esercizi ?? [];

      // Esercizi uniti in celle multi-riga: un atleta = una riga, niente rowSpan
      const esText = esercizi.map((e, i) => {
        let det = "";
        if (e.serie && (e.reps || e.durata)) {
          det = `${e.serie}×${e.reps || e.durata}${e.reps && e.durata ? ` ${e.durata}` : ""}`;
        } else if (!e.serie && !e.reps && e.durata) {
          det = `×${e.durata}`;
        } else {
          det = [e.serie, e.reps, e.durata].filter(Boolean).join(" ");
        }
        const carico = e.carico ? ` (${e.carico})` : "";
        return `${i + 1}. ${det ? `${e.nome} ${det}${carico}` : e.nome}`;
      }).join("\n") || "—";
      const vasText = (() => { const items = esercizi.map((e, i) => ({ n: i + 1, v: e.vas })).filter(x => x.v && x.v !== "0"); return items.length ? items.map(x => `${x.n}. ${x.v}`).join("\n") : "—"; })();

      const ca = prog.carico;
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

      const fisio = prog.noteFisioterapia?.trim() || "—";

      // Collect test rows for separate table
      for (const t of (prog.tests ?? [])) {
        const vals = [
          t.risultato,
          t.altezzaSalto ? `${t.altezzaSalto} cm` : "",
          t.rsi ? `RSI: ${t.rsi}` : "",
          t.risultatoSx ? `Sx ${t.risultatoSx}` : "",
          t.risultatoDx ? `Dx ${t.risultatoDx}` : "",
          t.rsiSx ? `RSI Sx: ${t.rsiSx}` : "",
          t.rsiDx ? `RSI Dx: ${t.rsiDx}` : "",
          t.tempo ? `${t.tempo}s` : "",
          t.livello ? `Liv: ${t.livello}` : "",
          t.vo2max ? `Vo2Max: ${t.vo2max}` : "",
          t.vam ? `VAM: ${t.vam}` : "",
          t.ginocchioDx ? `Gin.Dx: ${t.ginocchioDx}°` : "",
          t.ancaSx ? `Anca Sx: ${t.ancaSx}°` : "",
          t.diffGinocchioDxAncaSx ? `Δ: ${t.diffGinocchioDxAncaSx}°` : "",
          t.ginocchioSx ? `Gin.Sx: ${t.ginocchioSx}°` : "",
          t.ancaDx ? `Anca Dx: ${t.ancaDx}°` : "",
          t.diffGinocchioSxAncaDx ? `Δ: ${t.diffGinocchioSxAncaDx}°` : "",
        ].filter(Boolean);
        testRows.push({ dataLabel: dataFmt, nomeAtleta, nomeTest: t.nome, risultato: vals.join(" / ") || "—" });
      }

      if (isAlt) altRowIndices.add(body.length);
      body.push([nomeAtleta, prog.nome ?? "—", prog.fase ?? "—", fisio, obP, esText, vasText, obCampo, esC, vasC, gps, rpe]);
      dataRowCount++;
    }
  }

  autoTable(doc, {
    startY: HDR + 8,
    head: [["Atleta", "Programma", "Fase", "Fisio", "Obiettivi\nPalestra", "Esercizi\nPalestra", "VAS\nPal.", "Obiettivi\nCampo", "Esercizi\nCampo", "VAS\nCampo", "GPS", "RPE"]],
    body,
    headStyles: { fillColor: [110, 110, 110] as [number,number,number], textColor: 255, fontSize: 7, halign: "center", valign: "middle" },
    bodyStyles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" as const, halign: "left" as const, valign: "top" as const },
    rowPageBreak: "avoid",
    margin: { left: M, right: M, top: HDR + 8 },
    columnStyles: {
      0:  { cellWidth: 22, fontStyle: "bold" },
      1:  { cellWidth: 24 },
      2:  { cellWidth: 18 },
      3:  { cellWidth: 22 },
      4:  { cellWidth: 26 },
      5:  { cellWidth: 32 },
      6:  { cellWidth: 13, halign: "center" as const },
      7:  { cellWidth: 26 },
      8:  { cellWidth: 33 },
      9:  { cellWidth: 14, halign: "center" as const },
      10: { cellWidth: 24 },
      11: { cellWidth: 15, halign: "center" as const },
    },
    didDrawPage: () => {
      addHeader();
    },
    didParseCell: (data: any) => {
      if (data.section === "head") return;
      if (catRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [200, 16, 46];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 7.5;
        data.cell.styles.cellPadding = { top: 3.5, bottom: 3.5, left: 5, right: 2 };
      } else if (absenteRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [255, 237, 213];
        data.cell.styles.textColor = [154, 52, 18];
      } else if (riposoRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
      } else if (squadraRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [254, 226, 226];
        data.cell.styles.textColor = [153, 27, 27];
      } else if (altRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [249, 249, 251];
      } else {
        data.cell.styles.fillColor = [255, 255, 255];
      }
    },
  });

  // ── Test table (raggruppata per giocatore con rowSpan) ──────────────────────
  if (testRows.length > 0) {
    // Group consecutive rows by athlete
    const testGroups: { athlete: string; rows: typeof testRows }[] = [];
    for (const r of testRows) {
      if (testGroups.length === 0 || testGroups[testGroups.length - 1].athlete !== r.nomeAtleta)
        testGroups.push({ athlete: r.nomeAtleta, rows: [] });
      testGroups[testGroups.length - 1].rows.push(r);
    }
    const testBody: any[] = [];
    const testRowGroup: number[] = [];
    for (let gi = 0; gi < testGroups.length; gi++) {
      const g = testGroups[gi];
      const n = g.rows.length;
      g.rows.forEach((r, i) => {
        testRowGroup.push(gi);
        if (i === 0) {
          testBody.push([
            { content: r.dataLabel, rowSpan: n, styles: { halign: "center" as const, valign: "middle" as const } },
            { content: r.nomeAtleta, rowSpan: n, styles: { fontStyle: "bold" as const, valign: "middle" as const } },
            r.nomeTest,
            r.risultato,
          ]);
        } else {
          testBody.push([r.nomeTest, r.risultato]);
        }
      });
    }

    let tY = (doc as any).lastAutoTable.finalY + 8;
    if (tY > H - 40) {
      doc.addPage();
      addHeader();
      tY = HDR + 8;
    }
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
    doc.text("Test effettuati", M, tY);
    tY += 5;
    autoTable(doc, {
      startY: tY,
      head: [["Data", "Giocatore", "Test", "Risultato"]],
      body: testBody,
      headStyles: { fillColor: dark, textColor: [255, 255, 255] as [number, number, number], fontSize: 7, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" as const, valign: "middle" as const },
      margin: { left: M, right: M, top: HDR + 8 },
      columnStyles: {
        0: { cellWidth: 22, halign: "center" as const },
        1: { cellWidth: 45 },
        2: { cellWidth: 65 },
        3: { cellWidth: "auto" as any },
      },
      didDrawPage: () => { addHeader(); },
      didParseCell: (data: any) => {
        if (data.section === "body") {
          const gi = testRowGroup[data.row.index];
          data.cell.styles.fillColor = gi % 2 === 0 ? [255, 255, 255] : [249, 249, 249];
        }
      },
    });
  }

  addFooter();
  doc.save(`USC_Programmi_${data}.pdf`);
}

async function esportaPDFIntervallo(dataInizio: string, dataFine: string, atleti: Atleta[], tuttiProgrammi: Programma[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const progNelPeriodo = tuttiProgrammi.filter((p) => p.data >= dataInizio && p.data <= dataFine);
  if (progNelPeriodo.length === 0) return;

  const perData = new Map<string, Programma[]>();
  for (const prog of progNelPeriodo) {
    if (!perData.has(prog.data)) perData.set(prog.data, []);
    perData.get(prog.data)!.push(prog);
  }
  const dateOrdinate = Array.from(perData.keys()).sort();

  const doc = new jsPDF({ orientation: "landscape" });
  const red: [number, number, number] = [200, 16, 46];
  const dark: [number, number, number] = [43, 43, 43];
  const gray: [number, number, number] = [130, 130, 130];
  const logoDataUrl = await getLogoDataUrl();
  const fmtD = (d: string) => new Date(d + "T12:00").toLocaleDateString("it-IT");
  const periodoLabel = `${fmtD(dataInizio)} – ${fmtD(dataFine)}`;
  const M = 14; const W = 297; const H = 210; const HDR = 30;

  const addHeader = () => {
    doc.setFillColor(247, 247, 247); doc.rect(0, 0, W, HDR, "F");
    doc.setDrawColor(...red); doc.setLineWidth(0.4); doc.line(0, HDR, W, HDR);
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 4, 4, 22, 22);
    const tx = logoDataUrl ? 30 : M;
    doc.setTextColor(...red); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("U.S. Cremonese", tx, 15);
    doc.setFontSize(9); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(...gray);
    doc.text("Rehab Area – Programmi di Lavoro", tx, 19);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
    doc.text(`Periodo: ${periodoLabel}`, tx, 24);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(175, 175, 175);
    doc.text("Stagione 2026-2027", W - M, 14, { align: "right" });
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

  const testRowsIntervallo: { dataLabel: string; nomeAtleta: string; nomeTest: string; risultato: string }[] = [];
  const CATEGORIE_ORD = ["1ª Squadra", "U19", "U17", "U16", "U15", "U14", "Altra squadra", "Provino"];

  const DATE_ROW_H = 12;
  const drawDateRow = (label: string, y: number) => {
    doc.setFillColor(255, 255, 255); doc.rect(M, y, W - 2 * M, DATE_ROW_H, "F");
    doc.setDrawColor(...red); doc.setLineWidth(0.5); doc.line(M, y + DATE_ROW_H, W - M, y + DATE_ROW_H);
    doc.setTextColor(...red); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(label, M + 8, y + DATE_ROW_H / 2 + 1.5, { baseline: "middle" as const });
  };

  const tableOpts = (body: any[], catRowIndices: Set<number>, absenteRowIndices: Set<number>, riposoRowIndices: Set<number>, squadraRowIndices: Set<number>, altRowIndices: Set<number>) => ({
    startY: HDR + 8 + DATE_ROW_H,
    head: [["Atleta", "Programma", "Fase", "Fisio", "Obiettivi\nPalestra", "Esercizi\nPalestra", "VAS\nPal.", "Obiettivi\nCampo", "Esercizi\nCampo", "VAS\nCampo", "GPS", "RPE"]],
    body,
    headStyles: { fillColor: [110, 110, 110] as [number,number,number], textColor: 255, fontSize: 7, halign: "center" as const, valign: "middle" as const },
    bodyStyles: { fontSize: 7, cellPadding: 2.5, overflow: "linebreak" as const, halign: "left" as const, valign: "top" as const },
    rowPageBreak: "avoid" as const,
    margin: { left: M, right: M, top: HDR + 8 },
    columnStyles: {
      0:  { cellWidth: 22, fontStyle: "bold" as const },
      1:  { cellWidth: 24 },
      2:  { cellWidth: 18 },
      3:  { cellWidth: 22 },
      4:  { cellWidth: 26 },
      5:  { cellWidth: 32 },
      6:  { cellWidth: 13, halign: "center" as const },
      7:  { cellWidth: 26 },
      8:  { cellWidth: 33 },
      9:  { cellWidth: 14, halign: "center" as const },
      10: { cellWidth: 24 },
      11: { cellWidth: 15, halign: "center" as const },
    },
    didDrawPage: () => { addHeader(); },
    didParseCell: (data: any) => {
      if (data.section === "head") return;
      if (catRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [200, 16, 46];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 7.5;
        data.cell.styles.cellPadding = { top: 3, bottom: 3, left: 5, right: 2 };
      } else if (absenteRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [255, 237, 213];
        data.cell.styles.textColor = [154, 52, 18];
      } else if (riposoRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
      } else if (squadraRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [254, 226, 226];
        data.cell.styles.textColor = [153, 27, 27];
      } else if (altRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [249, 249, 251];
      } else {
        data.cell.styles.fillColor = [255, 255, 255];
      }
    },
  });

  for (let dIdx = 0; dIdx < dateOrdinate.length; dIdx++) {
    const data = dateOrdinate[dIdx];
    if (dIdx > 0) { doc.addPage(); addHeader(); }

    const body: any[] = [];
    const catRowIndices = new Set<number>();
    const absenteRowIndices = new Set<number>();
    const riposoRowIndices = new Set<number>();
    const squadraRowIndices = new Set<number>();
    const altRowIndices = new Set<number>();

    const progDelGiorno = perData.get(data) ?? [];
    const dataConGiorno = (() => { const s = new Date(data + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); })();
    const dataShort = new Date(data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
    drawDateRow(dataConGiorno, HDR + 8);

    const perCategoria = new Map<string, { atleta: Atleta; prog: Programma }[]>();
    for (const prog of progDelGiorno) {
      const atleta = atleti.find((a) => a.id === prog.atletaId);
      if (!atleta) continue;
      const cat = atleta.categoria ?? "—";
      if (!perCategoria.has(cat)) perCategoria.set(cat, []);
      perCategoria.get(cat)!.push({ atleta, prog });
    }

    const categoriePres = CATEGORIE_ORD.filter((c) => perCategoria.has(c));
    const altreCategorie = Array.from(perCategoria.keys()).filter((c) => !CATEGORIE_ORD.includes(c)).sort();
    let dataRowCount = 0;

    for (const cat of [...categoriePres, ...altreCategorie]) {
      const lista = (perCategoria.get(cat) ?? []).sort((a, b) => nd(a.atleta).localeCompare(nd(b.atleta), "it"));
      catRowIndices.add(body.length);
      body.push([{ content: cat, colSpan: 12 }]);

      for (const { atleta, prog } of lista) {
        const nomeAtleta = nd(atleta);
        const isAlt = dataRowCount % 2 === 1;

        if (prog.assente) {
          absenteRowIndices.add(body.length);
          body.push([nomeAtleta, { content: "ASSENTE" + (prog.noteAssenza ? ` – ${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++; continue;
        }
        if (prog.riposo) {
          riposoRowIndices.add(body.length);
          body.push([nomeAtleta, { content: "RIPOSO" + (prog.noteAssenza ? ` – ${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++; continue;
        }
        if (prog.squadra) {
          squadraRowIndices.add(body.length);
          body.push([nomeAtleta, { content: "SQUADRA" + (prog.noteAssenza ? ` – ${prog.noteAssenza}` : ""), colSpan: 11, styles: { halign: "center" as const, fontStyle: "bold" as const } }]);
          dataRowCount++; continue;
        }

        const obP = prog.obiettiviPalestra?.length ? prog.obiettiviPalestra.map(o => `- ${o.replace(/\//g, "/ ")}`).join("\n") : "—";
        const obCampo = prog.obiettiviCampo?.length ? prog.obiettiviCampo.map(o => `- ${o.replace(/\//g, "/ ")}`).join("\n") : "—";
        const esC = (prog.esercizicampo ?? []).map((c, i) => {
          const parts = [c.tipo, c.serie ? `${c.serie}×` : "", c.durata || ""].filter(Boolean);
          return `${i + 1}. ${parts.join(" ")}`;
        }).join("\n") || "—";
        const vasC = (() => { const items = (prog.esercizicampo ?? []).map((c: any, i: number) => ({ n: i + 1, v: c.vas })).filter(x => x.v && x.v !== "0"); return items.length ? items.map(x => `${x.n}. ${x.v}`).join("\n") : "—"; })();
        const rpe = prog.carico?.rpe ? `${prog.carico.rpe}/10` : "—";
        const esercizi = prog.esercizi ?? [];
        const esText = esercizi.map((e, i) => {
          const metric = e.reps || e.durata; const sx = [e.serie, metric].filter(Boolean).join("×");
          const carico = e.carico ? ` (${e.carico})` : "";
          return `${i + 1}. ${sx ? `${e.nome} ${sx}${carico}` : e.nome}`;
        }).join("\n") || "—";
        const vasText = (() => { const items = esercizi.map((e, i) => ({ n: i + 1, v: e.vas })).filter(x => x.v && x.v !== "0"); return items.length ? items.map(x => `${x.n}. ${x.v}`).join("\n") : "—"; })();
        const ca = prog.carico;
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

        const fisio = prog.noteFisioterapia?.trim() || "—";

        // Collect test rows for separate table
        for (const t of (prog.tests ?? [])) {
          const vals = [
            t.risultato,
            t.altezzaSalto ? `${t.altezzaSalto} cm` : "",
            t.rsi ? `RSI: ${t.rsi}` : "",
            t.risultatoSx ? `Sx ${t.risultatoSx}` : "",
            t.risultatoDx ? `Dx ${t.risultatoDx}` : "",
            t.rsiSx ? `RSI Sx: ${t.rsiSx}` : "",
            t.rsiDx ? `RSI Dx: ${t.rsiDx}` : "",
            t.tempo ? `${t.tempo}s` : "",
            t.livello ? `Liv: ${t.livello}` : "",
            t.vo2max ? `Vo2Max: ${t.vo2max}` : "",
            t.vam ? `VAM: ${t.vam}` : "",
            t.ginocchioDx ? `Gin.Dx: ${t.ginocchioDx}°` : "",
            t.ancaSx ? `Anca Sx: ${t.ancaSx}°` : "",
            t.diffGinocchioDxAncaSx ? `Δ: ${t.diffGinocchioDxAncaSx}°` : "",
            t.ginocchioSx ? `Gin.Sx: ${t.ginocchioSx}°` : "",
            t.ancaDx ? `Anca Dx: ${t.ancaDx}°` : "",
            t.diffGinocchioSxAncaDx ? `Δ: ${t.diffGinocchioSxAncaDx}°` : "",
          ].filter(Boolean);
          testRowsIntervallo.push({ dataLabel: dataShort, nomeAtleta, nomeTest: t.nome, risultato: vals.join(" / ") || "—" });
        }

        if (isAlt) altRowIndices.add(body.length);
        body.push([nomeAtleta, prog.nome ?? "—", prog.fase ?? "—", fisio, obP, esText, vasText, obCampo, esC, vasC, gps, rpe]);
        dataRowCount++;
      }
    }

    autoTable(doc, tableOpts(body, catRowIndices, absenteRowIndices, riposoRowIndices, squadraRowIndices, altRowIndices));
  }

  // ── Test table (raggruppata per data+giocatore con rowSpan) ─────────────────
  if (testRowsIntervallo.length > 0) {
    // Group consecutive rows by date+athlete key
    const testGroups: { key: string; rows: typeof testRowsIntervallo }[] = [];
    for (const r of testRowsIntervallo) {
      const key = `${r.dataLabel}||${r.nomeAtleta}`;
      if (testGroups.length === 0 || testGroups[testGroups.length - 1].key !== key)
        testGroups.push({ key, rows: [] });
      testGroups[testGroups.length - 1].rows.push(r);
    }
    const testBody: any[] = [];
    // groupForRow[bodyRowIndex] = groupIndex (for alternating colors per player group)
    const groupForRow: number[] = [];
    testGroups.forEach((g, gi) => {
      const n = g.rows.length;
      g.rows.forEach((r, i) => {
        groupForRow.push(gi);
        if (i === 0) {
          testBody.push([
            { content: r.dataLabel, rowSpan: n, styles: { halign: "center" as const, valign: "middle" as const } },
            { content: r.nomeAtleta, rowSpan: n, styles: { fontStyle: "bold" as const, valign: "middle" as const } },
            r.nomeTest,
            r.risultato,
          ]);
        } else {
          testBody.push([r.nomeTest, r.risultato]);
        }
      });
    });
    // Alternating fill colors per group (not per row)
    const GROUP_FILL_EVEN: [number, number, number] = [255, 255, 255];
    const GROUP_FILL_ODD: [number, number, number] = [249, 249, 249];

    let tY = (doc as any).lastAutoTable.finalY + 8;
    if (tY > H - 40) {
      doc.addPage();
      addHeader();
      tY = HDR + 8;
    }
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
    doc.text("Test effettuati", M, tY);
    tY += 5;
    autoTable(doc, {
      startY: tY,
      head: [["Data", "Giocatore", "Test", "Risultato"]],
      body: testBody,
      headStyles: { fillColor: dark, textColor: [255, 255, 255] as [number, number, number], fontSize: 7, halign: "center", valign: "middle" },
      bodyStyles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" as const, valign: "middle" as const },
      margin: { left: M, right: M, top: HDR + 8 },
      columnStyles: {
        0: { cellWidth: 22, halign: "center" as const },
        1: { cellWidth: 45 },
        2: { cellWidth: 65 },
        3: { cellWidth: "auto" as any },
      },
      didParseCell: (data: any) => {
        if (data.section === "body") {
          const gi = groupForRow[data.row.index];
          data.cell.styles.fillColor = gi % 2 === 0 ? GROUP_FILL_EVEN : GROUP_FILL_ODD;
        }
      },
      didDrawPage: () => { addHeader(); },
    });
  }

  addFooter();
  const fmtFile = (d: string) => d.replace(/-/g, "");
  doc.save(`USC_Programmi_${fmtFile(dataInizio)}_${fmtFile(dataFine)}.pdf`);
}

function buildProgrammiCSV(righe: { data: string; atleta: string; categoria: string; programma: string; fase: string; fisio: string; obP: string; esP: string; vasP: string; obC: string; esC: string; vasC: string; rpe: string; tipo: string; noteAssenza: string }[]): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["Data","Atleta","Categoria","Tipo","Programma","Fase","Fisioterapia","Obiettivi Palestra","Esercizi Palestra","VAS Palestra","Obiettivi Campo","Esercizi Campo","VAS Campo","RPE","Note"];
  const rows = righe.map(r => [r.data, r.atleta, r.categoria, r.tipo, r.programma, r.fase, r.fisio, r.obP, r.esP, r.vasP, r.obC, r.esC, r.vasC, r.rpe, r.noteAssenza].map(q).join(","));
  return [header.map(q).join(","), ...rows].join("\r\n");
}

function rigaProgramma(data: string, atleta: Atleta, prog: Programma) {
  const tipo = prog.assente ? "Assente" : prog.riposo ? "Riposo" : prog.squadra ? "Squadra" : "Rehab";
  const noteAssenza = prog.noteAssenza ?? "";
  if (prog.assente || prog.riposo || prog.squadra) {
    return { data, atleta: nd(atleta), categoria: atleta.categoria ?? "", tipo, programma: "", fase: "", fisio: "", obP: "", esP: "", vasP: "", obC: "", esC: "", vasC: "", rpe: "", noteAssenza };
  }
  const obP = (prog.obiettiviPalestra ?? []).join(" | ");
  const esercizi = prog.esercizi ?? [];
  const esP = esercizi.map((e, i) => {
    let det = "";
    if (e.serie && (e.reps || e.durata)) det = `${e.serie}x${e.reps || e.durata}${e.reps && e.durata ? ` ${e.durata}` : ""}`;
    else det = [e.serie, e.reps, e.durata].filter(Boolean).join(" ");
    const carico = e.carico ? ` (${e.carico})` : "";
    return `${i+1}. ${det ? `${e.nome} ${det}${carico}` : e.nome}`;
  }).join(" | ");
  const vasP = esercizi.map((e, i) => `${i+1}. ${e.vas || "0"}`).join(" | ");
  const obC = (prog.obiettiviCampo ?? []).join(" | ");
  const esCampo = prog.esercizicampo ?? [];
  const esC = esCampo.map((c: any, i: number) => {
    const parts = [c.tipo, c.serie ? `${c.serie}x` : "", c.durata || ""].filter(Boolean);
    return `${i+1}. ${parts.join(" ")}`;
  }).join(" | ");
  const vasC = esCampo.map((c: any, i: number) => `${i+1}. ${c.vas || "0"}`).join(" | ");
  const rpe = prog.carico?.rpe ? `${prog.carico.rpe}/10` : "";
  const fisio = prog.noteFisioterapia?.trim() ?? "";
  return { data, atleta: nd(atleta), categoria: atleta.categoria ?? "", tipo, programma: prog.nome ?? "", fase: prog.fase ?? "", fisio, obP, esP, vasP, obC, esC, vasC, rpe, noteAssenza };
}

function esportaCSVGiornaliero(data: string, atleti: Atleta[], tuttiProgrammi: Programma[]) {
  const programmiGiorno = tuttiProgrammi.filter(p => p.data === data);
  const righe = atleti.filter(a => a.stato === "Infortunato").flatMap(atleta => {
    const progs = programmiGiorno.filter(p => p.atletaId === atleta.id);
    if (progs.length === 0) return [];
    return progs.map(prog => rigaProgramma(data, atleta, prog));
  });
  const csv = buildProgrammiCSV(righe);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `USC_Programmi_${data}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function esportaCSVIntervallo(dataInizio: string, dataFine: string, atleti: Atleta[], tuttiProgrammi: Programma[]) {
  const righe = tuttiProgrammi
    .filter(p => p.data >= dataInizio && p.data <= dataFine)
    .sort((a, b) => a.data.localeCompare(b.data))
    .flatMap(prog => {
      const atleta = atleti.find(a => a.id === prog.atletaId);
      if (!atleta) return [];
      return [rigaProgramma(prog.data, atleta, prog)];
    });
  const csv = buildProgrammiCSV(righe);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const fmtFile = (d: string) => d.replace(/-/g, "");
  const a = document.createElement("a"); a.href = url; a.download = `USC_Programmi_${fmtFile(dataInizio)}_${fmtFile(dataFine)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function parseGpsCsv(text: string): Partial<Carico> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return {};
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const rows = lines.slice(1).map((l) => l.split(sep).map((v) => v.trim().replace(/['"]/g, "")));

  const findCol = (...names: string[]) =>
    headers.findIndex((h) => names.some((n) => h.includes(n)));

  const distCol = findCol("distance", "distanza", "dist", "total_dist");
  const speedCol = findCol("speed", "velocity", "velocit", "vel");
  const accCol = findCol("acceleration", "accel");
  const hsrCol = findCol("hsr", "high speed", "high_speed", "sprint");

  let distTotal = 0, speedMax = 0, accCount = 0, hsrTotal = 0;
  rows.forEach((row) => {
    if (distCol >= 0) distTotal += parseFloat(row[distCol]) || 0;
    if (speedCol >= 0) speedMax = Math.max(speedMax, parseFloat(row[speedCol]) || 0);
    if (accCol >= 0 && (parseFloat(row[accCol]) || 0) > 2) accCount++;
    if (hsrCol >= 0) hsrTotal += parseFloat(row[hsrCol]) || 0;
  });

  return {
    distanzaTotale: distTotal > 0 ? (distTotal > 500 ? Math.round(distTotal).toString() : Math.round(distTotal * 1000).toString()) : "",
    velocitaMax: speedMax > 0 ? speedMax.toFixed(1) : "",
    accelerazioni: accCount > 0 ? String(accCount) : "",
    hsr: hsrTotal > 0 ? hsrTotal.toFixed(0) : "",
  };
}

type FormSection = "esercizi" | "campo" | "test" | "carico" | "fisioterapia";

export default function EserciziPage() {
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [programmiPerAtleta, setProgrammiPerAtleta] = useState<Record<string, Programma[]>>({});
  const [atletaAperto, setAtletaAperto] = useState<string | null>(null);
  const [caricandoAtleta, setCaricandoAtleta] = useState(false);
  const [aperto, setAperto] = useState<string | null>(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm] = useState<Omit<Programma, "id">>(progVuoto);
  const [editId, setEditId] = useState<string | null>(null);
  const [sezioneAttiva, setSezioneAttiva] = useState<FormSection>("esercizi");
  const [gpsCaricando, setGpsCaricando] = useState(false);
  const gpsInputRef = useRef<HTMLInputElement>(null);
  const [dataGiorno, setDataGiorno] = useState(new Date().toISOString().slice(0, 10));
  const [esportandoGiorno, setEsportandoGiorno] = useState(false);
  const [dataInizioIntervallo, setDataInizioIntervallo] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataFineIntervallo, setDataFineIntervallo] = useState(() => new Date().toISOString().slice(0, 10));
  const [esportandoIntervallo, setEsportandoIntervallo] = useState(false);
  const [esportandoCSVGiorno, setEsportandoCSVGiorno] = useState(false);
  const [esportandoCSVIntervallo, setEsportandoCSVIntervallo] = useState(false);
  const [atletiAggiuntivi, setAtletiAggiuntivi] = useState<string[]>([]);

  const atletiOrdinati = useMemo(() => [...atleti].sort((a, b) => nd(a).localeCompare(nd(b), "it")), [atleti]);

  useEffect(() => {
    loadAtleti().then(setAtleti);
    const unsubAtleti = subscribeToAtleti(() => loadAtleti().then(setAtleti));
    const unsubProgrammi = subscribeToProgrammi((atletaId) => {
      if (atletaId) {
        loadProgrammi(atletaId).then((progs) =>
          setProgrammiPerAtleta((prev) => ({ ...prev, [atletaId]: progs }))
        );
      }
    });
    return () => { unsubAtleti(); unsubProgrammi(); };
  }, []);

  const apriAtleta = async (atletaId: string) => {
    if (atletaAperto === atletaId) { setAtletaAperto(null); return; }
    setAtletaAperto(atletaId);
    if (!(atletaId in programmiPerAtleta)) {
      setCaricandoAtleta(true);
      const progs = await loadProgrammi(atletaId);
      setProgrammiPerAtleta((prev) => ({ ...prev, [atletaId]: progs }));
      setCaricandoAtleta(false);
    }
  };

  const apriNuovo = () => {
    setForm({ ...progVuoto, data: new Date().toISOString().slice(0, 10), esercizi: [], esercizicampo: [], tests: [], carico: { ...caricoVuoto }, assente: false, riposo: false, squadra: false, noteAssenza: "" });
    setEditId(null); setMostraForm(true); setSezioneAttiva("esercizi"); setAtletiAggiuntivi([]);
  };

  const copiaDaPrecedente = () => {
    if (!form.atletaId) return;
    const lista = programmiPerAtleta[form.atletaId] ?? [];
    if (!lista.length) return;
    const precedente = [...lista].sort((a, b) => b.data.localeCompare(a.data))[0];
    setForm((prev) => ({
      ...prev,
      fase: precedente.fase,
      esercizi: (precedente.esercizi ?? []).map((e) => ({ ...e })),
      esercizicampo: (precedente.esercizicampo ?? []).map((c) => ({ ...c })),
      obiettiviPalestra: [...(precedente.obiettiviPalestra ?? [])],
      obiettiviCampo: [...(precedente.obiettiviCampo ?? [])],
      tests: (precedente.tests ?? []).map((t) => ({ ...t })),
      noteFisioterapia: precedente.noteFisioterapia ?? "",
    }));
  };

  const apriModifica = (p: Programma) => {
    const { id, ...rest } = p;
    setForm({ ...rest, esercizi: rest.esercizi.map((e) => ({ ...e })), esercizicampo: (rest.esercizicampo ?? []).map((c) => ({ ...c })), tests: (rest.tests ?? []).map((t) => ({ ...t })), carico: rest.carico ?? { ...caricoVuoto } });
    setEditId(id); setMostraForm(true); setSezioneAttiva("esercizi");
    if (rest.atletaId && !(rest.atletaId in programmiPerAtleta)) {
      loadProgrammi(rest.atletaId).then((progs) =>
        setProgrammiPerAtleta((prev) => ({ ...prev, [rest.atletaId]: progs }))
      ).catch(() => {});
    }
  };

  const salvaProgramma = async () => {
    if (!form.atletaId) return;
    const nomeEffettivo = form.assente && !form.nome.trim() ? "Assenza" : form.riposo && !form.nome.trim() ? "Riposo" : form.squadra && !form.nome.trim() ? "Squadra" : form.nome;
    if (!nomeEffettivo.trim()) return;
    const pulito = { ...form, nome: nomeEffettivo, esercizi: form.esercizi.filter((e) => e.nome.trim()), esercizicampo: (form.esercizicampo ?? []).filter((c) => c.tipo), tests: (form.tests ?? []).filter((t) => t.nome.trim()) };
    const prog: Programma = editId ? { ...pulito, id: editId } : { ...pulito, id: uid() };
    await upsertProgramma(prog);
    setProgrammiPerAtleta((prev) => {
      const id = prog.atletaId;
      if (!(id in prev)) return prev;
      const lista = prev[id];
      return { ...prev, [id]: editId ? lista.map((p) => p.id === editId ? prog : p) : [...lista, prog] };
    });

    // Quando si registra "Squadra", porta automaticamente l'atleta a Disponibile
    if (form.squadra) {
      const atleta = atleti.find((a) => a.id === form.atletaId);
      if (atleta && atleta.stato === "Infortunato") {
        const fineRehab = prog.data; // usa la data della sessione come fine riabilitazione
        const diagnosi = atleta.infortunio;
        const inizioRehab = atleta.inizioRehab;
        const tipo = atleta.tipoInfortunio;
        const nuovoStorico: InfortunioStorico[] = [...(atleta.storicoInfortuni ?? [])];
        if (diagnosi || inizioRehab) {
          nuovoStorico.push({
            id: uid(),
            tipo,
            diagnosi: diagnosi || "—",
            inizioRehab: inizioRehab || "",
            fineRehab,
            note: atleta.note || undefined,
          });
        }
        const aggiornato: Atleta = {
          ...atleta,
          stato: "Disponibile",
          fineRehab,
          storicoInfortuni: nuovoStorico,
          infortunio: "",
          tipoInfortunio: undefined,
          inizioRehab: "",
          progresso: 100,
        };
        aggiornato.progresso = calcolaProgressoAuto(aggiornato);
        await upsertAtleta(aggiornato);
        setAtleti((prev) => prev.map((a) => a.id === aggiornato.id ? aggiornato : a));
      }
    }

    // Salva una copia del programma per ogni atleta aggiuntivo — solo esercizi, no dati rehab
    for (const addId of atletiAggiuntivi) {
      const pulitoCopia = {
        atletaId: addId,
        nome: pulito.nome,
        data: pulito.data,
        fase: "",
        esercizi: pulito.esercizi,
        esercizicampo: pulito.esercizicampo,
        obiettiviPalestra: pulito.obiettiviPalestra,
        obiettiviCampo: pulito.obiettiviCampo,
        tests: pulito.tests,
        carico: pulito.carico,
      };
      const progCopia: Programma = { ...pulitoCopia, id: uid() };
      await upsertProgramma(progCopia);
      setProgrammiPerAtleta((prev) => {
        if (!(addId in prev)) return prev;
        return { ...prev, [addId]: [...prev[addId], progCopia] };
      });
      if (form.squadra) {
        const atletaAdd = atleti.find((a) => a.id === addId);
        if (atletaAdd && atletaAdd.stato === "Infortunato") {
          const fineRehabAdd = progCopia.data;
          const nuovoStoricoAdd: InfortunioStorico[] = [...(atletaAdd.storicoInfortuni ?? [])];
          if (atletaAdd.infortunio || atletaAdd.inizioRehab) {
            nuovoStoricoAdd.push({ id: uid(), tipo: atletaAdd.tipoInfortunio, diagnosi: atletaAdd.infortunio || "—", inizioRehab: atletaAdd.inizioRehab || "", fineRehab: fineRehabAdd, note: atletaAdd.note || undefined });
          }
          const aggiornatoAdd: Atleta = { ...atletaAdd, stato: "Disponibile", fineRehab: fineRehabAdd, storicoInfortuni: nuovoStoricoAdd, infortunio: "", tipoInfortunio: undefined, inizioRehab: "", progresso: 100 };
          aggiornatoAdd.progresso = calcolaProgressoAuto(aggiornatoAdd);
          await upsertAtleta(aggiornatoAdd);
          setAtleti((prev) => prev.map((a) => a.id === aggiornatoAdd.id ? aggiornatoAdd : a));
        }
      }
    }
    setAtletiAggiuntivi([]);
    setMostraForm(false);
  };

  const eliminaProgramma = async (id: string) => {
    await deleteProgramma(id);
    setProgrammiPerAtleta((prev) => {
      const updated: Record<string, Programma[]> = {};
      for (const [aid, lista] of Object.entries(prev)) updated[aid] = lista.filter((p) => p.id !== id);
      return updated;
    });
  };

  // Esercizi
  const aggiungiEs = () => setForm({ ...form, esercizi: [...form.esercizi, { ...esVuoto }] });
  const rimuoviEs = (i: number) => setForm({ ...form, esercizi: form.esercizi.filter((_, idx) => idx !== i) });
  const aggiornaEs = (i: number, campo: keyof Esercizio, val: string) => {
    setForm({ ...form, esercizi: form.esercizi.map((e, idx) => idx === i ? { ...e, [campo]: val } : e) });
  };

  // Esercizi in campo
  const esercizicampo = form.esercizicampo ?? [];
  const aggiungiCampo = () => setForm({ ...form, esercizicampo: [...esercizicampo, { ...campoVuoto }] });
  const rimuoviCampo = (i: number) => setForm({ ...form, esercizicampo: esercizicampo.filter((_, idx) => idx !== i) });
  const aggiornaCampo = (i: number, campo: keyof EsercizioCampo, val: string) => {
    setForm({ ...form, esercizicampo: esercizicampo.map((c, idx) => idx === i ? { ...c, [campo]: val } : c) });
  };

  // Test
  const tests = form.tests ?? [];
  const aggiungiTest = () => setForm({ ...form, tests: [...tests, { ...testVuoto }] });
  const rimuoviTest = (i: number) => setForm({ ...form, tests: tests.filter((_, idx) => idx !== i) });
  const aggiornaTest = (i: number, campo: keyof TestFisiometrico, val: string) => {
    setForm({ ...form, tests: tests.map((t, idx) => idx === i ? { ...t, [campo]: val } : t) });
  };

  // Carico
  const carico = form.carico ?? { ...caricoVuoto };
  const aggiornaCarico = (campo: keyof Carico, val: string) => {
    const next = { ...carico, [campo]: val };
    if (campo === "rpe" || campo === "durata") {
      const r = Number(campo === "rpe" ? val : next.rpe);
      const d = Number(campo === "durata" ? val : next.durata);
      next.interno = r > 0 && d > 0 ? String(Math.round(r * d)) : next.interno;
    }
    setForm({ ...form, carico: next });
  };

  const handleGpsFile = async (file: File | null) => {
    if (!file) return;
    setGpsCaricando(true);
    const text = await file.text();
    const parsed = parseGpsCsv(text);
    setForm({ ...form, carico: { ...carico, ...parsed } });
    setGpsCaricando(false);
  };

  const tabClass = (s: FormSection) =>
    `flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${sezioneAttiva === s ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`;

  const fontePerSuggerimenti = (programmiPerAtleta[form.atletaId] ?? []).filter((p) => !p.assente && !p.riposo && !p.squadra);
  const nomiUnici = Array.from(new Set(fontePerSuggerimenti.map((p) => p.nome).filter(Boolean)));
  const fasiUniche = Array.from(new Set(fontePerSuggerimenti.map((p) => p.fase).filter(Boolean)));
  const nomiFiltrati = nomiUnici.filter((n) => !form.nome.trim() || n.toLowerCase().includes(form.nome.toLowerCase())).slice(0, 6);
  const fasiFiltrate = fasiUniche.filter((f) => !form.fase.trim() || f.toLowerCase().includes(form.fase.toLowerCase())).slice(0, 6);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programmi <span className="whitespace-nowrap">di Lavoro</span></h1>
          <p className="text-gray-500 mt-0.5 text-sm">{atleti.length} atleti</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white shadow-sm">
            <input
              type="date"
              value={dataGiorno}
              onChange={(e) => setDataGiorno(e.target.value)}
              className="text-sm text-gray-700 focus:outline-none bg-transparent"
            />
          </div>
          <button
            disabled={esportandoGiorno}
            onClick={async () => {
              setEsportandoGiorno(true);
              try {
                const tutti = await loadProgrammi();
                await esportaPDFGiornaliero(dataGiorno, atleti, tutti);
              } finally {
                setEsportandoGiorno(false);
              }
            }}
            className="flex items-center gap-1.5 border border-red-200 text-[#C8102E] px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50 shrink-0 whitespace-nowrap bg-white shadow-sm">
            <FileText className="w-4 h-4" />
            {esportandoGiorno ? "Generazione…" : "PDF del giorno"}
          </button>
          <button
            disabled={esportandoCSVGiorno}
            onClick={async () => {
              setEsportandoCSVGiorno(true);
              try {
                const tutti = await loadProgrammi();
                esportaCSVGiornaliero(dataGiorno, atleti, tutti);
              } finally {
                setEsportandoCSVGiorno(false);
              }
            }}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 shrink-0 whitespace-nowrap bg-white shadow-sm">
            <FileDown className="w-4 h-4" />
            {esportandoCSVGiorno ? "Generazione…" : "CSV del giorno"}
          </button>
          <button onClick={apriNuovo}
            className="flex items-center gap-1.5 bg-[#C8102E] text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-800 shrink-0 whitespace-nowrap">
            <Plus className="w-4 h-4" /> Nuovo programma
          </button>
        </div>
      </div>

      {/* PDF intervallo */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500 font-medium shrink-0">PDF periodo:</span>
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 bg-white shadow-sm">
          <span className="text-xs text-gray-400">Da</span>
          <input
            type="date"
            value={dataInizioIntervallo}
            onChange={(e) => setDataInizioIntervallo(e.target.value)}
            className="text-sm text-gray-700 focus:outline-none bg-transparent"
          />
        </div>
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 bg-white shadow-sm">
          <span className="text-xs text-gray-400">A</span>
          <input
            type="date"
            value={dataFineIntervallo}
            onChange={(e) => setDataFineIntervallo(e.target.value)}
            className="text-sm text-gray-700 focus:outline-none bg-transparent"
          />
        </div>
        <button
          disabled={esportandoIntervallo}
          onClick={async () => {
            setEsportandoIntervallo(true);
            try {
              const tutti = await loadProgrammi();
              await esportaPDFIntervallo(dataInizioIntervallo, dataFineIntervallo, atleti, tutti);
            } finally {
              setEsportandoIntervallo(false);
            }
          }}
          className="flex items-center gap-1.5 border border-red-200 text-[#C8102E] px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50 shrink-0 whitespace-nowrap bg-white shadow-sm">
          <FileText className="w-4 h-4" />
          {esportandoIntervallo ? "Generazione…" : "PDF periodo"}
        </button>
        <button
          disabled={esportandoCSVIntervallo}
          onClick={async () => {
            setEsportandoCSVIntervallo(true);
            try {
              const tutti = await loadProgrammi();
              esportaCSVIntervallo(dataInizioIntervallo, dataFineIntervallo, atleti, tutti);
            } finally {
              setEsportandoCSVIntervallo(false);
            }
          }}
          className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 shrink-0 whitespace-nowrap bg-white shadow-sm">
          <FileDown className="w-4 h-4" />
          {esportandoCSVIntervallo ? "Generazione…" : "CSV periodo"}
        </button>
      </div>

      {atleti.length === 0 ? (
        <div className="text-center py-20">
          <Dumbbell className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 text-lg font-medium">Nessun atleta ancora</p>
          <p className="text-gray-300 text-sm mt-1">Aggiungi prima un atleta per creare programmi</p>
        </div>
      ) : atletiOrdinati.filter((a) => a.stato === "Infortunato").length === 0 ? (
        <div className="text-center py-20">
          <Dumbbell className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 text-lg font-medium">Nessun atleta in riabilitazione</p>
          <p className="text-gray-300 text-sm mt-1">Tutti gli atleti sono disponibili</p>
        </div>
      ) : (
        <div className="space-y-3">
          {atletiOrdinati.filter((a) => a.stato === "Infortunato").map((atleta) => {
            const isOpen = atletaAperto === atleta.id;
            const lista = programmiPerAtleta[atleta.id] ?? [];
            return (
            <div key={atleta.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button onClick={() => apriAtleta(atleta.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 text-left">
                <div className="w-8 h-8 bg-[#2B2B2B] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {nd(atleta).trim().split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>(w[0]??"").toUpperCase()).join("")}
                </div>
                <span className="font-bold text-gray-800 flex-1">{nd(atleta)}</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{atleta.categoria}</span>
                {isOpen && atleta.id in programmiPerAtleta && (() => {
                  const assenze = new Set(lista.filter((p) => p.assente).map((p) => p.data)).size;
                  const riposi  = new Set(lista.filter((p) => p.riposo).map((p) => p.data)).size;
                  const sessioni = new Set(lista.filter((p) => !p.assente && !p.riposo).map((p) => p.data)).size;
                  return (
                    <span className="text-xs flex items-center gap-1">
                      {sessioni > 0 && <span className="text-gray-400">{sessioni} sess.</span>}
                      {riposi > 0 && <><span className="text-gray-300">·</span><span className="text-blue-400">{riposi} rip.</span></>}
                      {assenze > 0 && <><span className="text-gray-300">·</span><span className="text-orange-400">{assenze} ass.</span></>}
                    </span>
                  );
                })()}
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                  {caricandoAtleta && !(atleta.id in programmiPerAtleta) ? (
                    <p className="text-sm text-gray-400 text-center py-4">Caricamento…</p>
                  ) : lista.length === 0 ? (
                    <p className="text-sm text-gray-400 italic text-center py-4">Nessun programma per questo atleta</p>
                  ) : (
                  <div className="space-y-4">
                {(() => {
                  const tuttiOrdinati = [...lista].sort((a, b) => b.data.localeCompare(a.data));
                  return (
                    <div className="space-y-2">
                      {tuttiOrdinati.map((prog) => (
                  <div key={prog.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${prog.assente ? "border-orange-100" : prog.riposo ? "border-blue-100" : prog.squadra ? "border-red-100" : "border-gray-100"}`}>
                    <button onClick={() => setAperto(aperto === prog.id ? null : prog.id)}
                      className="w-full flex items-center gap-4 p-5 hover:bg-gray-50 text-left">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${prog.assente ? "bg-orange-400" : prog.riposo ? "bg-blue-400" : prog.squadra ? "bg-[#C8102E]" : "bg-[#C8102E]"}`}>
                        {prog.assente ? <CalendarX2 className="w-5 h-5 text-white" /> : prog.riposo ? <CalendarX2 className="w-5 h-5 text-white" /> : prog.squadra ? <Users className="w-5 h-5 text-white" /> : <Dumbbell className="w-5 h-5 text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{prog.nome}</h3>
                          {prog.assente && <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">Assente</span>}
                          {prog.riposo && <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">Riposo</span>}
                          {prog.squadra && <span className="text-xs bg-red-100 text-[#C8102E] font-semibold px-2 py-0.5 rounded-full">Squadra</span>}
                          {prog.fase && !prog.assente && !prog.riposo && !prog.squadra && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{prog.fase}</span>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {prog.data ? new Date(prog.data + "T12:00").toLocaleDateString("it-IT") : ""}
                          {prog.assente
                            ? (prog.noteAssenza ? ` · ${prog.noteAssenza}` : "")
                            : prog.riposo
                            ? (prog.noteAssenza ? ` · ${prog.noteAssenza}` : "")
                            : (<>{" "}· {prog.esercizi.length} esercizi{prog.esercizicampo?.length ? ` · ${prog.esercizicampo.length} in campo` : ""}{prog.tests?.length ? ` · ${prog.tests.length} test` : ""}</>)
                          }
                        </p>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ${aperto === prog.id ? "rotate-180" : ""}`} />
                    </button>

                    {aperto === prog.id && (
                      <div className="border-t border-gray-100 p-5">
                        {/* Fisioterapia */}
                        {prog.noteFisioterapia?.trim() && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <ShieldPlus className="w-3.5 h-3.5" /> Fisioterapia
                            </p>
                            <p className="text-sm text-gray-700 bg-pink-50 border border-pink-100 rounded-xl px-3 py-2.5 whitespace-pre-wrap">{prog.noteFisioterapia.trim()}</p>
                          </div>
                        )}

                        {/* Esercizi */}
                        {prog.esercizi.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1"><Dumbbell className="w-3.5 h-3.5" /> Esercizi in Palestra</p>
                            <div className="space-y-2">
                              {prog.esercizi.map((es, i) => (
                                <div key={i} className="bg-gray-100 border border-gray-300 rounded-xl p-3">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="font-semibold text-gray-900 text-sm">{es.nome}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                      {es.serie && <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-full">{es.serie} serie</span>}
                                      {es.reps && <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-full">{es.reps}</span>}
                                      {es.durata && <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-full">{es.durata}</span>}
                                      {es.carico && <span className="bg-white border border-blue-200 text-blue-600 px-2 py-0.5 rounded-full">{es.carico}</span>}
                                      {es.rir && <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-full">RIR {es.rir}</span>}
                                      <span className="bg-white border border-red-200 text-red-600 px-2 py-0.5 rounded-full">VAS {es.vas || "0"}/10</span>
                                    </div>
                                  </div>
                                  {es.note && <p className="text-xs text-gray-500 mt-1.5 italic">{es.note}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Esercizi in campo */}
                        {prog.esercizicampo && prog.esercizicampo.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                              <Footprints className="w-3.5 h-3.5" /> Esercizi in campo
                            </p>
                            <div className="space-y-2">
                              {prog.esercizicampo.map((c, i) => (
                                <div key={i} className="bg-gray-100 border border-gray-300 rounded-xl p-3">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="font-semibold text-gray-900 text-sm">{c.tipo}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                      {c.serie && <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-full">{c.serie} serie</span>}
                                      {c.durata && <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-full">{c.durata}</span>}
                                      <span className="bg-white border border-red-200 text-red-600 px-2 py-0.5 rounded-full">VAS {c.vas || "0"}/10</span>
                                    </div>
                                  </div>
                                  {c.descrizione && <p className="text-xs text-gray-500 mt-1.5 italic">{c.descrizione}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Test */}
                        {prog.tests && prog.tests.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5" /> Test fisioterapici
                            </p>
                            <div className="space-y-2">
                              {prog.tests.map((t, i) => {
                                const isDropJump   = t.nome === "Drop Jump";
                                const isSLDropJump = t.nome === "SL Drop Jump";
                                const isCMJInline  = t.nome === "CMJ – Counter Movement Jump" || t.nome === "CMJ braccia libere" || t.nome === "Squat Jump";
                                const isBroadJumpInline = t.nome === "Broad Jump";
                                const isQSLSInline = t.nome === "QSLS";
                                const asim = isSLDropJump
                                  ? calcolaAsimmetria(t.rsiSx ?? "", t.rsiDx ?? "")
                                  : calcolaAsimmetria(t.risultatoSx, t.risultatoDx);
                                const sup = isSLDropJump
                                  ? superioreTest(t.rsiSx ?? "", t.rsiDx ?? "")
                                  : superioreTest(t.risultatoSx, t.risultatoDx);
                                const prevTest = trovaPrecedenteTest(lista, prog.id, t.nome);
                                const delta = isQSLSInline ? null : calcolaDelta(t, prevTest);
                                return (
                                  <div key={i} className={`rounded-xl p-3 border ${asim !== null && asim > 10 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100"}`}>
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <p className="font-semibold text-gray-900 text-sm">{t.nome === "Personalizzato" ? t.risultato : t.nome}</p>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {asim !== null && sup !== null && (
                                          <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${asim > 10 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                            {asim > 10 && <AlertTriangle className="w-3 h-3" />}
                                            {sup} +{asim.toFixed(1)}%
                                          </span>
                                        )}
                                        {delta !== null && (
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${delta >= 0 ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                                            {delta >= 0 ? "↑" : "↓"} {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {isCMJInline ? (
                                      <p className="text-xs text-gray-600 mt-0.5">
                                        {t.altezzaSalto ? <>Altezza: <strong>{t.altezzaSalto} cm</strong></> : "—"}
                                      </p>
                                    ) : isBroadJumpInline ? (
                                      <p className="text-xs text-gray-600 mt-0.5">
                                        {t.altezzaSalto ? <>Distanza: <strong>{t.altezzaSalto} cm</strong></> : "—"}
                                      </p>
                                    ) : isQSLSInline ? (
                                      <div className="flex gap-4 mt-1.5 text-xs text-gray-600">
                                        {t.risultatoSx && <span>Sx: <strong>{t.risultatoSx}/5</strong></span>}
                                        {t.risultatoDx && <span>Dx: <strong>{t.risultatoDx}/5</strong></span>}
                                      </div>
                                    ) : isDropJump ? (
                                      <div className="flex gap-4 mt-1.5 text-xs text-gray-600">
                                        {t.altezzaSalto && <span>Altezza: <strong>{t.altezzaSalto} cm</strong></span>}
                                        {t.tempoContatto && <span>Contatto: <strong>{t.tempoContatto} s</strong></span>}
                                        {t.rsi && <span>RSI: <strong>{t.rsi}</strong></span>}
                                      </div>
                                    ) : isSLDropJump ? (
                                      <div className="grid grid-cols-2 gap-3 mt-1.5 text-xs text-gray-600">
                                        <div>
                                          <span className="font-semibold text-blue-600">Sx</span>
                                          {t.altezzaSaltoSx && <span className="ml-2">↕ <strong>{t.altezzaSaltoSx} cm</strong></span>}
                                          {t.tempoContattoSx && <span className="ml-2">⏱ <strong>{t.tempoContattoSx} s</strong></span>}
                                          {t.rsiSx && <span className="ml-2">RSI <strong>{t.rsiSx}</strong></span>}
                                        </div>
                                        <div>
                                          <span className="font-semibold text-orange-600">Dx</span>
                                          {t.altezzaSaltoDx && <span className="ml-2">↕ <strong>{t.altezzaSaltoDx} cm</strong></span>}
                                          {t.tempoContattoDx && <span className="ml-2">⏱ <strong>{t.tempoContattoDx} s</strong></span>}
                                          {t.rsiDx && <span className="ml-2">RSI <strong>{t.rsiDx}</strong></span>}
                                        </div>
                                      </div>
                                    ) : (t.risultatoSx || t.risultatoDx) ? (
                                      <div className="flex gap-4 mt-1.5 text-xs text-gray-600">
                                        {t.risultatoSx && <span>Sx: <strong className="text-gray-900">{t.risultatoSx}{t.unita && ` ${t.unita}`}</strong></span>}
                                        {t.risultatoDx && <span>Dx: <strong className="text-gray-900">{t.risultatoDx}{t.unita && ` ${t.unita}`}</strong></span>}
                                      </div>
                                    ) : t.risultato ? (
                                      <p className="text-xs text-gray-600 mt-0.5">{t.risultato} {t.unita}</p>
                                    ) : null}
                                    {t.tempo && <p className="text-xs text-gray-600 mt-0.5">Tempo: <strong>{t.tempo}s</strong></p>}
                                    {(t.livello || t.vo2max || t.vam) && (
                                      <div className="flex gap-4 mt-1.5 text-xs text-gray-600">
                                        {t.livello && <span>Livello: <strong>{t.livello}</strong></span>}
                                        {t.vo2max && <span>Vo2Max: <strong>{t.vo2max} ml/kg/min</strong></span>}
                                        {t.vam && <span>VAM: <strong>{t.vam} km/h</strong></span>}
                                      </div>
                                    )}
                                    {(t.ginocchioDx || t.ancaSx || t.ginocchioSx || t.ancaDx) && (
                                      <div className="space-y-0.5 mt-1.5 text-xs text-gray-600">
                                        {(t.ginocchioDx || t.ancaSx) && (
                                          <div className="flex gap-3">
                                            {t.ginocchioDx && <span>Gin.Dx: <strong>{t.ginocchioDx}°</strong></span>}
                                            {t.ancaSx && <span>Anca Sx: <strong>{t.ancaSx}°</strong></span>}
                                            {t.diffGinocchioDxAncaSx && <span>Δ: <strong>{t.diffGinocchioDxAncaSx}°</strong></span>}
                                          </div>
                                        )}
                                        {(t.ginocchioSx || t.ancaDx) && (
                                          <div className="flex gap-3">
                                            {t.ginocchioSx && <span>Gin.Sx: <strong>{t.ginocchioSx}°</strong></span>}
                                            {t.ancaDx && <span>Anca Dx: <strong>{t.ancaDx}°</strong></span>}
                                            {t.diffGinocchioSxAncaDx && <span>Δ: <strong>{t.diffGinocchioSxAncaDx}°</strong></span>}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {t.note && <p className="text-xs text-gray-400 mt-1 italic">{t.note}</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Carico */}
                        {prog.carico && Object.values(prog.carico).some(Boolean) && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                              <Gauge className="w-3.5 h-3.5" /> Carico sessione
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {[
                                { label: "RPE", value: prog.carico.rpe, unit: "/10" },
                                { label: "Durata", value: prog.carico.durata, unit: "min" },
                                { label: "Training Load", value: prog.carico.interno, unit: "" },
                                { label: "Distanza", value: prog.carico.distanzaTotale, unit: "m" },
                                { label: "Vel. max", value: prog.carico.velocitaMax, unit: "km/h" },
                                { label: "Dist. >16 km/h", value: prog.carico.hsr, unit: "m" },
                                { label: "Dist. >20 km/h", value: prog.carico.velocita21, unit: "m" },
                                { label: "Dist. >25 km/h", value: prog.carico.velocita25, unit: "m" },
                                { label: "Acc. >3 m/s²", value: prog.carico.accelerazioni, unit: "" },
                                { label: "Dec. >3 m/s²", value: prog.carico.decelerazioni, unit: "" },
                                { label: "Sprint", value: prog.carico.sprint, unit: "" },
                                { label: "Pot. metabolica", value: prog.carico.potenzaMetabolica, unit: "W/kg" },
                              ].filter((x) => x.value).map(({ label, value, unit }) => (
                                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                                  <p className="text-xs text-gray-400">{label}</p>
                                  <p className="font-bold text-gray-900 mt-0.5">{value}{unit && <span className="text-xs font-normal text-gray-500 ml-0.5">{unit}</span>}</p>
                                </div>
                              ))}
                            </div>
                            {prog.carico.note && <p className="text-xs text-gray-500 mt-2 italic">{prog.carico.note}</p>}
                          </div>
                        )}

                        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                          <button onClick={() => apriModifica(prog)}
                            className="flex items-center gap-1.5 text-[#C8102E] text-sm font-medium hover:underline">
                            <Edit2 className="w-4 h-4" /> Modifica
                          </button>
                          <button onClick={() => eliminaProgramma(prog.id)}
                            className="flex items-center gap-1.5 text-gray-400 hover:text-red-500 text-sm ml-auto">
                            <Trash2 className="w-4 h-4" /> Elimina
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                      ))}
                    </div>
                  );
                })()}
                  </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Modale */}
      {mostraForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editId ? "Modifica Programma" : "Nuovo Programma"}</h2>
              <div className="flex items-center gap-3">
                {!editId && form.atletaId && (programmiPerAtleta[form.atletaId]?.length ?? 0) > 0 && (
                  <button
                    onClick={copiaDaPrecedente}
                    className="text-xs font-semibold text-[#C8102E] border border-[#C8102E] rounded-lg px-3 py-1.5 hover:bg-[#C8102E] hover:text-white transition-colors"
                  >
                    Copia da precedente
                  </button>
                )}
                <button onClick={() => setMostraForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {/* Info base */}
              <div className="flex gap-3 items-end">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Atleta *</label>
                  <select value={form.atletaId} onChange={(e) => {
                      const id = e.target.value;
                      setForm({ ...form, atletaId: id, infortunioId: undefined, infortunioLabel: undefined });
                      if (id && !(id in programmiPerAtleta)) {
                        loadProgrammi(id).then((progs) =>
                          setProgrammiPerAtleta((prev) => ({ ...prev, [id]: progs }))
                        ).catch(() => {});
                      }
                    }}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                    <option value="">Seleziona atleta...</option>
                    {atletiOrdinati.filter((a) => a.stato === "Infortunato").map((a) => <option key={a.id} value={a.id}>{nd(a)} ({a.categoria})</option>)}
                  </select>
                </div>
                <div className="shrink-0">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">Data</label>
                  <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
                    style={{ width: "6rem" }}
                    className="mt-1 border border-gray-200 rounded-xl px-2 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white" />
                </div>
              </div>

              {/* Applica anche ad altri atleti (solo nuovo programma) */}
              {!editId && form.atletaId && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Applica anche a</label>
                  <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden max-h-36 overflow-y-auto divide-y divide-gray-100">
                    {atletiOrdinati
                      .filter((a) => a.id !== form.atletaId && a.stato === "Infortunato")
                      .map((a) => {
                        const checked = atletiAggiuntivi.includes(a.id);
                        return (
                          <label key={a.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? "bg-red-50" : "hover:bg-gray-50"}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setAtletiAggiuntivi((prev) => checked ? prev.filter((id) => id !== a.id) : [...prev, a.id])}
                              className="w-4 h-4 accent-[#C8102E] shrink-0"
                            />
                            <span className="text-sm text-gray-700">{nd(a)}</span>
                            <span className="text-xs text-gray-400 ml-auto">{a.categoria}</span>
                          </label>
                        );
                      })}
                    {atletiOrdinati.filter((a) => a.id !== form.atletaId && a.stato === "Infortunato").length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">Nessun altro atleta disponibile</p>
                    )}
                  </div>
                  {atletiAggiuntivi.length > 0 && (
                    <p className="mt-1.5 text-xs text-[#C8102E] font-medium">Il programma verrà salvato per {atletiAggiuntivi.length + 1} atleti</p>
                  )}
                </div>
              )}

              {/* Presente / Assente / Riposo / Squadra */}
              {(() => {
                const isPresente = !form.assente && !form.riposo && !form.squadra;
                const opts: { label: string; icon: React.ReactNode; active: boolean; color: "green"|"orange"|"blue"|"red"; onClick: () => void }[] = [
                  { label: "Presente", icon: <span className="text-lg leading-none">✓</span>, active: isPresente, color: "green",  onClick: () => setForm({ ...form, assente: false, riposo: false, squadra: false }) },
                  { label: "Assente",  icon: <span className="text-lg leading-none">✕</span>, active: !!form.assente,  color: "orange", onClick: () => setForm({ ...form, assente: true,  riposo: false, squadra: false }) },
                  { label: "Riposo",   icon: <BatteryFull className="w-5 h-5" />,             active: !!form.riposo,   color: "blue",   onClick: () => setForm({ ...form, assente: false, riposo: true,  squadra: false }) },
                  { label: "Squadra",  icon: <Users className="w-5 h-5" />,                   active: !!form.squadra,  color: "red",    onClick: () => setForm({ ...form, assente: false, riposo: false, squadra: true  }) },
                ];
                const activeClass: Record<"green"|"orange"|"blue"|"red", string> = {
                  green:  "bg-green-500  border-green-500  text-white",
                  orange: "bg-orange-500 border-orange-500 text-white",
                  blue:   "bg-blue-500   border-blue-500   text-white",
                  red:    "bg-[#C8102E]  border-[#C8102E]  text-white",
                };
                return (
                  <div className="grid grid-cols-4 gap-2">
                    {opts.map(({ label, icon, active, color, onClick }) => (
                      <button key={label} type="button" onClick={onClick}
                        className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all ${active ? activeClass[color] : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                        {icon}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Nota assenza / riposo */}
              {(form.assente || form.riposo) && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{form.assente ? "Motivo assenza" : "Note riposo"}</label>
                  <textarea value={form.noteAssenza ?? ""}
                    onChange={(e) => setForm({ ...form, noteAssenza: e.target.value })}
                    placeholder={form.assente ? "Es. Febbre, impegno scolastico, infortunio acuto…" : "Es. Riposo programmato, recupero…"}
                    rows={2}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none" />
                </div>
              )}

              {/* Injury selector + Nome/Fase + Tab */}
              {!form.assente && !form.riposo && !form.squadra && <>
              {(() => {
                const atletaSelezionato = atleti.find((a) => a.id === form.atletaId);
                if (!atletaSelezionato) return null;
                const opzioniInf = [
                  ...(atletaSelezionato.stato === "Infortunato" && (atletaSelezionato.infortunio || atletaSelezionato.inizioRehab)
                    ? [{ id: "__corrente__", label: `In corso: ${atletaSelezionato.infortunio || "—"}` }]
                    : []),
                  ...[...(atletaSelezionato.storicoInfortuni ?? [])].reverse().map((inf) => ({
                    id: inf.id,
                    label: `${inf.diagnosi}${inf.tipo ? ` (${inf.tipo})` : ""}`,
                  })),
                ];
                if (opzioniInf.length === 0) return null;
                return (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Infortunio di riferimento</label>
                    <select
                      value={form.infortunioId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        const label = opzioniInf.find((o) => o.id === id)?.label ?? "";
                        setForm({ ...form, infortunioId: id || undefined, infortunioLabel: id ? label : undefined });
                      }}
                      className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                      <option value="">— Nessuno / Non specificato —</option>
                      {opzioniInf.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                );
              })()}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome programma *</label>
                  <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Scrivi nuovo nome..."
                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  {nomiUnici.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {nomiFiltrati.map((n) => (
                        <button key={n} type="button"
                          onClick={() => setForm({ ...form, nome: n })}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.nome === n ? "bg-[#C8102E] text-white border-[#C8102E]" : "bg-gray-50 text-gray-600 border-gray-200 active:bg-red-50 active:text-[#C8102E] active:border-[#C8102E]"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fase</label>
                  <input value={form.fase} onChange={(e) => setForm({ ...form, fase: e.target.value })}
                    placeholder="Scrivi nuova fase..."
                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  {fasiUniche.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {fasiFiltrate.map((f) => (
                        <button key={f} type="button"
                          onClick={() => setForm({ ...form, fase: f })}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.fase === f ? "bg-[#C8102E] text-white border-[#C8102E]" : "bg-gray-50 text-gray-600 border-gray-200 active:bg-red-50 active:text-[#C8102E] active:border-[#C8102E]"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Durata / RPE / Training Load — sempre visibili */}
              {!form.assente && !form.riposo && (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Durata (min)</label>
                    <input
                      value={carico.durata}
                      onChange={(e) => aggiornaCarico("durata", e.target.value)}
                      placeholder="Es. 75"
                      type="number" min="0"
                      className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">RPE (/10)</label>
                    <input
                      value={carico.rpe}
                      onChange={(e) => aggiornaCarico("rpe", e.target.value)}
                      placeholder="Es. 6"
                      type="number" min="1" max="10"
                      className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Training Load</label>
                    <input
                      value={carico.interno}
                      readOnly
                      placeholder="RPE × min"
                      className="mt-1 w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              {(() => {
                const tabs = [
                  { key: "fisioterapia" as FormSection, label: "Fisio",       icon: ShieldPlus,         count: null },
                  { key: "esercizi"     as FormSection, label: "Palestra",    icon: Dumbbell,     count: form.esercizi.length },
                  { key: "campo"        as FormSection, label: "Campo",       icon: Footprints,   count: esercizicampo.length },
                  { key: "carico"       as FormSection, label: "GPS",         icon: Gauge,        count: null },
                  { key: "test"         as FormSection, label: "Test",        icon: TrendingUp, count: tests.length },
                ];
                const renderTab = ({ key, label, icon: Icon, count }: typeof tabs[number]) => (
                  <button key={key} className={tabClass(key)} onClick={() => setSezioneAttiva(key)}>
                    <span className="flex flex-col items-center gap-0.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex items-center gap-1">
                        {label}
                        {count !== null && count > 0 && (
                          <span className="bg-[#C8102E] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">{count}</span>
                        )}
                      </span>
                    </span>
                  </button>
                );
                return (
                  <div className="flex flex-col bg-gray-100 rounded-xl p-1 gap-1">
                    <div className="flex gap-1">{tabs.slice(0, 3).map(renderTab)}</div>
                    <div className="flex gap-1">{tabs.slice(3).map(renderTab)}</div>
                  </div>
                );
              })()}

              {/* Sezione Esercizi */}
              {sezioneAttiva === "esercizi" && (
                <div>
                  {/* Obiettivi palestra */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Obiettivi</label>
                    <div className="flex flex-wrap gap-1.5">
                      {OBIETTIVI_PALESTRA.map((ob) => {
                        const sel = (form.obiettiviPalestra ?? []).includes(ob);
                        return (
                          <button key={ob} type="button"
                            onClick={() => {
                              const cur = form.obiettiviPalestra ?? [];
                              setForm({ ...form, obiettiviPalestra: sel ? cur.filter(x => x !== ob) : [...cur, ob] });
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                              sel ? "bg-[#C8102E] text-white border-[#C8102E]" : "bg-white text-gray-500 border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
                            }`}>
                            {ob}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Esercizi in Palestra</label>
                    <button onClick={aggiungiEs} className="text-[#C8102E] text-xs font-semibold hover:underline">+ Aggiungi</button>
                  </div>
                  <div className="space-y-3">
                    {form.esercizi.map((es, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                        {/* Nome + cestino */}
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{i + 1}</span>
                          <input value={es.nome} onChange={(e) => aggiornaEs(i, "nome", e.target.value)}
                            placeholder="Nome esercizio"
                            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                          <button onClick={() => rimuoviEs(i)} className="text-gray-300 hover:text-red-400 shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Metriche: 5 colonne compatte */}
                        <div className="grid grid-cols-5 gap-1.5">
                          {([ ["Serie", "serie"], ["Reps", "reps"], ["Durata", "durata"], ["Carico", "carico"], ["RIR", "rir"] ] as const).map(([label, key]) => (
                            <div key={key}>
                              <p className="text-[10px] text-gray-400 mb-0.5 text-center">{label}</p>
                              <input value={es[key]} onChange={(e) => aggiornaEs(i, key, e.target.value)} placeholder="—"
                                className="w-full bg-white border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                            </div>
                          ))}
                        </div>
                        {/* VAS */}
                        <ScaleInput label={`VAS: ${es.vas || 0}/10`} value={es.vas} max={10} onChange={(v) => aggiornaEs(i, "vas", v)} color="text-red-500" />
                        {/* Note */}
                        <input value={es.note} onChange={(e) => aggiornaEs(i, "note", e.target.value)} placeholder="Note"
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                      </div>
                    ))}
                  </div>

                  {/* RPE sessione */}
                  <div className="mt-4 bg-orange-50 border border-orange-100 rounded-xl p-4">
                    <ScaleInput
                      label={`RPE sessione: ${carico.rpe || 0}/10`}
                      value={carico.rpe}
                      max={10}
                      onChange={(v) => aggiornaCarico("rpe", v)}
                      color="text-orange-500"
                    />
                    <p className="text-xs text-orange-400 mt-2">Valutazione dello sforzo percepito a fine seduta</p>
                  </div>
                </div>
              )}

              {/* Sezione Campo */}
              {sezioneAttiva === "campo" && (
                <div>
                  {/* Obiettivi campo */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Obiettivi</label>
                    <div className="flex flex-wrap gap-1.5">
                      {OBIETTIVI_CAMPO.map((ob) => {
                        const sel = (form.obiettiviCampo ?? []).includes(ob);
                        return (
                          <button key={ob} type="button"
                            onClick={() => {
                              const cur = form.obiettiviCampo ?? [];
                              setForm({ ...form, obiettiviCampo: sel ? cur.filter(x => x !== ob) : [...cur, ob] });
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                              sel ? "bg-[#C8102E] text-white border-[#C8102E]" : "bg-white text-gray-500 border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
                            }`}>
                            {ob}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Esercizi in campo</label>
                    <button onClick={aggiungiCampo} className="text-[#C8102E] text-xs font-semibold hover:underline">+ Aggiungi</button>
                  </div>
                  {esercizicampo.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <Footprints className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      Nessun esercizio in campo. Clicca "+ Aggiungi" per inserirne uno.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {esercizicampo.map((c, i) => {
                        const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white";
                        return (
                          <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{i + 1}</span>
                              <input value={c.tipo} onChange={(e) => aggiornaCampo(i, "tipo", e.target.value)}
                                placeholder="Nome esercizio (es. Sprint, RSA, Metabolico...)"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white" />
                              <button onClick={() => rimuoviCampo(i)} className="text-gray-300 hover:text-red-400 shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Serie</p>
                                <input value={c.serie} onChange={(e) => aggiornaCampo(i, "serie", e.target.value)} placeholder="Es. 4" className={inp} />
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Durata</p>
                                <input value={c.durata} onChange={(e) => aggiornaCampo(i, "durata", e.target.value)} placeholder="Es. 30'' / 5'" className={inp} />
                              </div>
                            </div>
                            <ScaleInput label={`VAS: ${c.vas || 0}/10`} value={c.vas} max={10} onChange={(v) => aggiornaCampo(i, "vas", v)} color="text-red-500" />
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Descrizione</p>
                              <input value={c.descrizione} onChange={(e) => aggiornaCampo(i, "descrizione", e.target.value)}
                                placeholder="Es. 3×10'' lavoro a 90% VMax con recupero 30''" className={inp} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sezione Test */}
              {sezioneAttiva === "test" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Test fisioterapici e di performance</label>
                    <button onClick={aggiungiTest} className="text-[#C8102E] text-xs font-semibold hover:underline">+ Aggiungi test</button>
                  </div>
                  {tests.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <TrendingUp className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      Nessun test. Clicca "+ Aggiungi test" per inserire risultati.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tests.map((t, i) => {
                        const isDropJump   = t.nome === "Drop Jump";
                        const isSLDropJump = t.nome === "SL Drop Jump";
                        const isPersonalizzato = t.nome === "Personalizzato";
                        const isGaconIFT   = t.nome === "Gacon" || t.nome === "IFT 30-15";
                        const isSprintTempo = ["Sprint 10m", "Sprint 20m", "Sprint 30m", "10x100m"].includes(t.nome);
                        const isSqueeze    = t.nome === "Squeeze";
                        const isJurdan     = t.nome === "Jurdan";
                        const isCMJ        = t.nome === "CMJ – Counter Movement Jump" || t.nome === "CMJ braccia libere" || t.nome === "Squat Jump";
                        const isQSLS       = t.nome === "QSLS";
                        const isBroadJump  = t.nome === "Broad Jump";
                        const isDefaultDxSx = !isDropJump && !isSLDropJump && !isPersonalizzato && !isGaconIFT && !isSprintTempo && !isSqueeze && !isJurdan && !isCMJ && !isQSLS && !isBroadJump;
                        const asim = isSLDropJump
                          ? calcolaAsimmetria(t.rsiSx ?? "", t.rsiDx ?? "")
                          : calcolaAsimmetria(t.risultatoSx, t.risultatoDx);
                        const formSup = isSLDropJump
                          ? superioreTest(t.rsiSx ?? "", t.rsiDx ?? "")
                          : superioreTest(t.risultatoSx, t.risultatoDx);
                        const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white";
                        return (
                          <div key={i} className={`rounded-xl p-4 space-y-3 ${asim !== null && asim > 10 ? "bg-red-50 border border-red-200" : "bg-gray-50"}`}>
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{i + 1}</span>
                              <select value={t.nome} onChange={(e) => aggiornaTest(i, "nome", e.target.value)}
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                                <option value="">Seleziona test...</option>
                                {[...TESTS_PREDEFINITI]
                  .sort((a, b) => a === "Personalizzato" ? 1 : b === "Personalizzato" ? -1 : a.localeCompare(b, "it", { sensitivity: "base" }))
                  .map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                              </select>
                              <button onClick={() => rimuoviTest(i)} className="text-gray-300 hover:text-red-400 shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {isPersonalizzato && (
                              <input value={t.risultato} onChange={(e) => aggiornaTest(i, "risultato", e.target.value)}
                                placeholder="Nome test personalizzato" className={inp} />
                            )}

                            {isDropJump && (
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Altezza salto (cm)</p>
                                  <input value={t.altezzaSalto ?? ""} onChange={(e) => aggiornaTest(i, "altezzaSalto", e.target.value)} placeholder="es. 32" className={inp} />
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Tempo contatto (s)</p>
                                  <input value={t.tempoContatto ?? ""} onChange={(e) => aggiornaTest(i, "tempoContatto", e.target.value)} placeholder="es. 0.21" className={inp} />
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">RSI</p>
                                  <input value={t.rsi ?? ""} onChange={(e) => aggiornaTest(i, "rsi", e.target.value)} placeholder="es. 1.52" className={inp} />
                                </div>
                              </div>
                            )}

                            {isSLDropJump && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-3">
                                  {/* Sx */}
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Arto Sx</p>
                                    <div>
                                      <p className="text-xs text-gray-500 mb-1">Altezza salto (cm)</p>
                                      <input value={t.altezzaSaltoSx ?? ""} onChange={(e) => aggiornaTest(i, "altezzaSaltoSx", e.target.value)} placeholder="es. 30" className={inp} />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500 mb-1">Tempo contatto (s)</p>
                                      <input value={t.tempoContattoSx ?? ""} onChange={(e) => aggiornaTest(i, "tempoContattoSx", e.target.value)} placeholder="es. 0.22" className={inp} />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500 mb-1">RSI</p>
                                      <input value={t.rsiSx ?? ""} onChange={(e) => aggiornaTest(i, "rsiSx", e.target.value)} placeholder="es. 1.36" className={inp} />
                                    </div>
                                  </div>
                                  {/* Dx */}
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Arto Dx</p>
                                    <div>
                                      <p className="text-xs text-gray-500 mb-1">Altezza salto (cm)</p>
                                      <input value={t.altezzaSaltoDx ?? ""} onChange={(e) => aggiornaTest(i, "altezzaSaltoDx", e.target.value)} placeholder="es. 32" className={inp} />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500 mb-1">Tempo contatto (s)</p>
                                      <input value={t.tempoContattoDx ?? ""} onChange={(e) => aggiornaTest(i, "tempoContattoDx", e.target.value)} placeholder="es. 0.21" className={inp} />
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500 mb-1">RSI</p>
                                      <input value={t.rsiDx ?? ""} onChange={(e) => aggiornaTest(i, "rsiDx", e.target.value)} placeholder="es. 1.52" className={inp} />
                                    </div>
                                  </div>
                                </div>
                                {asim !== null && formSup !== null && (
                                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${asim > 10 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                    {asim > 10 && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                                    RSI: {formSup} superiore del {asim.toFixed(1)}%{asim > 10 ? " — attenzione!" : " — nella norma"}
                                  </div>
                                )}
                              </div>
                            )}

                            {isGaconIFT && (
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Livello</p>
                                  <input value={t.livello ?? ""} onChange={(e) => aggiornaTest(i, "livello", e.target.value)} placeholder="es. 18.5" className={inp} />
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Vo2Max (ml/kg/min)</p>
                                  <input value={t.vo2max ?? ""} onChange={(e) => aggiornaTest(i, "vo2max", e.target.value)} placeholder="es. 52.3" className={inp} />
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">VAM (km/h)</p>
                                  <input value={t.vam ?? ""} onChange={(e) => aggiornaTest(i, "vam", e.target.value)} placeholder="es. 17.0" className={inp} />
                                </div>
                              </div>
                            )}

                            {isSprintTempo && (
                              <div className="max-w-[200px]">
                                <p className="text-xs text-gray-500 mb-1">Tempo (s)</p>
                                <input value={t.tempo ?? ""} onChange={(e) => aggiornaTest(i, "tempo", e.target.value)} placeholder="es. 1.73" className={inp} />
                              </div>
                            )}

                            {isSqueeze && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Risultato</p>
                                  <input value={t.risultato} onChange={(e) => aggiornaTest(i, "risultato", e.target.value)} placeholder="es. 280" className={inp} />
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Unità</p>
                                  <input value={t.unita} onChange={(e) => aggiornaTest(i, "unita", e.target.value)} placeholder="N / kg" className={inp} />
                                </div>
                              </div>
                            )}

                            {isJurdan && (() => {
                              const gDx = parseFloat(t.ginocchioDx ?? "");
                              const aSx = parseFloat(t.ancaSx ?? "");
                              const gSx = parseFloat(t.ginocchioSx ?? "");
                              const aDx = parseFloat(t.ancaDx ?? "");
                              const autoDiff1 = (!isNaN(gDx) && !isNaN(aSx)) ? (gDx + aSx).toFixed(1) : "";
                              const autoDiff2 = (!isNaN(gSx) && !isNaN(aDx)) ? (gSx + aDx).toFixed(1) : "";
                              return (
                                <div className="space-y-3">
                                  {/* Riga 1: Ginocchio Dx + Anca Sx + diff */}
                                  <div>
                                    <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide mb-1.5">Ginocchio Dx / Anca Sx</p>
                                    <div className="grid grid-cols-3 gap-2">
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1">Ginocchio Dx (°)</p>
                                        <input value={t.ginocchioDx ?? ""} onChange={(e) => aggiornaTest(i, "ginocchioDx", e.target.value)} placeholder="es. 15" className={inp} />
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1">Anca Sx (°)</p>
                                        <input value={t.ancaSx ?? ""} onChange={(e) => aggiornaTest(i, "ancaSx", e.target.value)} placeholder="es. 10" className={inp} />
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1">Cumulativo (°)</p>
                                        <input
                                          value={t.diffGinocchioDxAncaSx !== undefined ? t.diffGinocchioDxAncaSx : autoDiff1}
                                          onChange={(e) => aggiornaTest(i, "diffGinocchioDxAncaSx", e.target.value)}
                                          placeholder="auto"
                                          className={inp} />
                                      </div>
                                    </div>
                                  </div>
                                  {/* Riga 2: Ginocchio Sx + Anca Dx + diff */}
                                  <div>
                                    <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1.5">Ginocchio Sx / Anca Dx</p>
                                    <div className="grid grid-cols-3 gap-2">
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1">Ginocchio Sx (°)</p>
                                        <input value={t.ginocchioSx ?? ""} onChange={(e) => aggiornaTest(i, "ginocchioSx", e.target.value)} placeholder="es. 12" className={inp} />
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1">Anca Dx (°)</p>
                                        <input value={t.ancaDx ?? ""} onChange={(e) => aggiornaTest(i, "ancaDx", e.target.value)} placeholder="es. 8" className={inp} />
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1">Cumulativo (°)</p>
                                        <input
                                          value={t.diffGinocchioSxAncaDx !== undefined ? t.diffGinocchioSxAncaDx : autoDiff2}
                                          onChange={(e) => aggiornaTest(i, "diffGinocchioSxAncaDx", e.target.value)}
                                          placeholder="auto"
                                          className={inp} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {isCMJ && (
                              <div className="max-w-[200px]">
                                <p className="text-xs text-gray-500 mb-1">Altezza salto (cm)</p>
                                <input value={t.altezzaSalto ?? ""} onChange={(e) => aggiornaTest(i, "altezzaSalto", e.target.value)} placeholder="es. 38" className={inp} />
                              </div>
                            )}

                            {isBroadJump && (
                              <div className="max-w-[200px]">
                                <p className="text-xs text-gray-500 mb-1">Distanza (cm)</p>
                                <input value={t.altezzaSalto ?? ""} onChange={(e) => aggiornaTest(i, "altezzaSalto", e.target.value)} placeholder="es. 210" className={inp} />
                              </div>
                            )}

                            {isQSLS && (
                              <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 mb-1.5">Punteggio: 0 = migliore · 5 = peggiore</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Arto Sx</p>
                                    <input type="number" min={0} max={5} value={t.risultatoSx} onChange={(e) => aggiornaTest(i, "risultatoSx", e.target.value)} placeholder="0–5" className={inp} />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Arto Dx</p>
                                    <input type="number" min={0} max={5} value={t.risultatoDx} onChange={(e) => aggiornaTest(i, "risultatoDx", e.target.value)} placeholder="0–5" className={inp} />
                                  </div>
                                </div>
                              </div>
                            )}

                            {isDefaultDxSx && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Arto Sx</p>
                                    <input value={t.risultatoSx} onChange={(e) => aggiornaTest(i, "risultatoSx", e.target.value)} placeholder="es. 85" className={inp} />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Arto Dx</p>
                                    <input value={t.risultatoDx} onChange={(e) => aggiornaTest(i, "risultatoDx", e.target.value)} placeholder="es. 92" className={inp} />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Unità</p>
                                    <input value={t.unita} onChange={(e) => aggiornaTest(i, "unita", e.target.value)} placeholder="cm / Nm / %" className={inp} />
                                  </div>
                                </div>
                                {asim !== null && formSup !== null && (
                                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${asim > 10 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                    {asim > 10 && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                                    {formSup} superiore del {asim.toFixed(1)}%
                                    {asim > 10
                                      ? (isJurdan ? " — rischio infortuni muscolari!" : " — attenzione!")
                                      : " — nella norma"}
                                  </div>
                                )}
                              </div>
                            )}

                            <input value={t.note} onChange={(e) => aggiornaTest(i, "note", e.target.value)}
                              placeholder="Note aggiuntive" className={inp} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sezione Carico / GPS */}
              {sezioneAttiva === "carico" && (
                <div className="space-y-4">
                  {/* GPS upload */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">File GPS (CSV)</label>
                    <input ref={gpsInputRef} type="file" accept=".csv,.txt" className="hidden"
                      onChange={(e) => handleGpsFile(e.target.files?.[0] ?? null)} />
                    <button onClick={() => gpsInputRef.current?.click()}
                      className="mt-1 w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-500 hover:border-[#C8102E] hover:text-[#C8102E] transition-all">
                      <Upload className="w-4 h-4" />
                      {gpsCaricando ? "Analisi GPS in corso..." : "Carica file GPS/CSV per auto-compilare i campi"}
                    </button>
                    <p className="text-xs text-gray-400 mt-1">Compatibile con Catapult, STATSports, GPSports – colonne distanza, velocità, acc. rilevate automaticamente</p>
                  </div>

                  {/* Riga 1 — sessione */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Durata (min)</label>
                      <input value={carico.durata} onChange={(e) => aggiornaCarico("durata", e.target.value)}
                        placeholder="Es. 75"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">RPE (/10)</label>
                      <input value={carico.rpe} onChange={(e) => aggiornaCarico("rpe", e.target.value)}
                        placeholder="Es. 6"
                        type="number" min="1" max="10"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Training Load</label>
                      <input value={carico.interno}
                        readOnly
                        placeholder="RPE × min"
                        className="mt-1 w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
                    </div>
                  </div>

                  {/* Riga 2 — distanza e velocità */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Distanza totale (m)</label>
                      <input value={carico.distanzaTotale} onChange={(e) => aggiornaCarico("distanzaTotale", e.target.value)}
                        placeholder="Es. 4200"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Velocità max (km/h)</label>
                      <input value={carico.velocitaMax} onChange={(e) => aggiornaCarico("velocitaMax", e.target.value)}
                        placeholder="Es. 24.5"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                  </div>

                  {/* Riga 3 — zone di velocità */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Distanza &gt;16 km/h (m)</label>
                      <input value={carico.hsr} onChange={(e) => aggiornaCarico("hsr", e.target.value)}
                        placeholder="Es. 350"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Distanza &gt;20 km/h (m)</label>
                      <input value={carico.velocita21 ?? ""} onChange={(e) => aggiornaCarico("velocita21", e.target.value)}
                        placeholder="Es. 280"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Distanza &gt;25 km/h (m)</label>
                      <input value={carico.velocita25 ?? ""} onChange={(e) => aggiornaCarico("velocita25", e.target.value)}
                        placeholder="Es. 120"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                  </div>

                  {/* Riga 4 — acc/dec */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Accelerazioni (≥3 m/s²)</label>
                      <input value={carico.accelerazioni} onChange={(e) => aggiornaCarico("accelerazioni", e.target.value)}
                        placeholder="Es. 42"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Decelerazioni (≤-3 m/s²)</label>
                      <input value={carico.decelerazioni ?? ""} onChange={(e) => aggiornaCarico("decelerazioni", e.target.value)}
                        placeholder="Es. 38"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                  </div>

                  {/* Riga 5 — sprint e potenza metabolica */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Numero di sprint</label>
                      <input value={carico.sprint ?? ""} onChange={(e) => aggiornaCarico("sprint", e.target.value)}
                        placeholder="Es. 12"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Potenza metabolica (W/kg)</label>
                      <input value={carico.potenzaMetabolica ?? ""} onChange={(e) => aggiornaCarico("potenzaMetabolica", e.target.value)}
                        placeholder="Es. 8.5"
                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note GPS</label>
                    <input value={carico.note} onChange={(e) => aggiornaCarico("note", e.target.value)}
                      placeholder="Note aggiuntive"
                      className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                </div>
              )}
              {sezioneAttiva === "fisioterapia" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note Fisioterapia</label>
                    {!form.noteFisioterapia && (
                      <button onClick={() => setForm({ ...form, noteFisioterapia: " " })}
                        className="text-[#C8102E] text-xs font-semibold hover:underline">+ Aggiungi</button>
                    )}
                  </div>
                  {form.noteFisioterapia ? (
                    <textarea
                      value={form.noteFisioterapia.trimStart()}
                      onChange={(e) => setForm({ ...form, noteFisioterapia: e.target.value })}
                      placeholder="Descrivi le attività svolte con il fisioterapista…"
                      rows={6}
                      autoFocus
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none"
                    />
                  ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <ShieldPlus className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      Nessuna nota. Clicca "+ Aggiungi" per inserire.
                    </div>
                  )}
                </div>
              )}
              </>}
            </div>

            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setMostraForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                Annulla
              </button>
              <button onClick={salvaProgramma} disabled={!form.atletaId || (!form.assente && !form.riposo && !form.squadra && !form.nome.trim())}
                className="flex-1 bg-[#C8102E] text-white py-3 rounded-xl text-sm font-medium hover:bg-red-800 disabled:opacity-40">
                {editId ? "Salva modifiche" : "Crea programma"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
