import ExcelJS from "exceljs";
import { loadAtleti, loadProgrammi, calcolaProgressoAuto, nd } from "./store";
import type { Atleta, Programma } from "./store";

const HDR_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B2B2B" } };
const HDR_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
const DATA_FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };
const ALT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F7" } };
const BORDER_STYLE: Partial<ExcelJS.Borders> = {
  top:    { style: "thin", color: { argb: "FFE0E0E0" } },
  left:   { style: "thin", color: { argb: "FFE0E0E0" } },
  bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
  right:  { style: "thin", color: { argb: "FFE0E0E0" } },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HDR_FILL;
    cell.font = HDR_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = BORDER_STYLE;
  });
  row.height = 22;
}

function styleData(row: ExcelJS.Row, alt: boolean) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = DATA_FONT;
    cell.alignment = { vertical: "middle" };
    cell.border = BORDER_STYLE;
    if (alt) cell.fill = ALT_FILL;
  });
  row.height = 18;
}

function setCols(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function progrOf(a: Atleta): number {
  return a.progressoManuale !== undefined ? a.progressoManuale : calcolaProgressoAuto(a);
}

export async function esportaExcel(): Promise<void> {
  const atleti = await loadAtleti();
  const programmiAll: Programma[] = [];
  for (const a of atleti) {
    const pp = await loadProgrammi(a.id);
    programmiAll.push(...pp);
  }
  const atletaMap = new Map(atleti.map((a) => [a.id, a]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "USC Cremonese – Rehab Area";
  wb.created = new Date();
  wb.modified = new Date();

  // ── 1. Atleti ────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Atleti", { views: [{ state: "frozen", ySplit: 1 }] });
    const cols = [
      "Nome", "Categoria", "Posizione", "Piede Dominante",
      "Stato", "Progresso %", "Infortunio", "Tipo Infortunio",
      "Inizio Rehab", "Fine Rehab", "Evento", "Meccanismo",
      "Contatto", "Lato", "Pos. Infortunio", "OSIICS",
      "Fisioterapista", "Preparatore Atletico",
      "Telefono", "Email", "Note",
      "Peso (kg)", "Altezza (cm)", "Alt. da Seduto (cm)", "Plicometrie", "Data Nascita",
    ];
    ws.addRow(cols);
    styleHeader(ws.getRow(1));
    setCols(ws, [25, 14, 18, 14, 12, 12, 35, 30, 12, 12, 14, 25, 18, 12, 20, 14, 22, 22, 16, 26, 30, 10, 12, 16, 14, 14]);

    atleti.forEach((a, i) => {
      const row = ws.addRow([
        nd(a), a.categoria, a.posizione, a.piedeDominante,
        a.stato, progrOf(a), a.infortunio, a.tipoInfortunio ?? "",
        a.inizioRehab, a.fineRehab ?? "", a.evento ?? "", a.meccanismo ?? "",
        a.contatto ?? "", a.lato ?? "", a.posizioneInfortunio ?? "",
        a.osiicsCodice ? `${a.osiicsCodice} – ${a.osiicsDescrizione ?? ""}` : "",
        a.fisioterapista, a.preparatoreAtletico,
        a.telefono, a.email, a.note,
        a.peso ?? "", a.altezza ?? "", a.altezzaDaSeduto ?? "", a.plicometrieMedie ?? "", a.dataNascita ?? "",
      ]);
      styleData(row, i % 2 === 0);
      const sc = row.getCell(5);
      if (a.stato === "Infortunato") {
        sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE8E8" } };
        sc.font = { ...DATA_FONT, color: { argb: "FFC8102E" }, bold: true };
      } else {
        sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
        sc.font = { ...DATA_FONT, color: { argb: "FF2E7D32" }, bold: true };
      }
    });
  }

  // ── 2. Infortuni ─────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Infortuni", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow([
      "Atleta", "Categoria", "Tipo Infortunio", "Diagnosi",
      "Inizio Rehab", "Fine Rehab", "Attivo",
      "Evento", "Meccanismo", "Contatto", "Lato", "Pos. Infortunio", "OSIICS", "Note",
    ]);
    styleHeader(ws.getRow(1));
    setCols(ws, [25, 14, 30, 35, 12, 12, 10, 14, 25, 18, 12, 20, 12, 35]);

    let ri = 0;
    for (const a of atleti) {
      if (a.stato === "Infortunato" && a.infortunio) {
        const r = ws.addRow([
          nd(a), a.categoria, a.tipoInfortunio ?? "", a.infortunio,
          a.inizioRehab, a.fineRehab ?? "", "Sì",
          a.evento ?? "", a.meccanismo ?? "", a.contatto ?? "",
          a.lato ?? "", a.posizioneInfortunio ?? "", a.osiicsCodice ?? "", a.note,
        ]);
        styleData(r, ri % 2 === 0); ri++;
      }
      for (const inf of (a.storicoInfortuni ?? [])) {
        const r = ws.addRow([
          nd(a), a.categoria, inf.tipo ?? "", inf.diagnosi,
          inf.inizioRehab, inf.fineRehab, inf.attivo ? "Sì" : "No",
          inf.evento ?? "", inf.meccanismo ?? "", inf.contatto ?? "",
          inf.lato ?? "", inf.posizioneInfortunio ?? "", inf.osiicsCodice ?? "", inf.note ?? "",
        ]);
        styleData(r, ri % 2 === 0); ri++;
      }
    }
  }

  // ── 3. Referti Clinici ───────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Referti Clinici", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(["Atleta", "Categoria", "Data", "Tipo", "Esito", "Note"]);
    styleHeader(ws.getRow(1));
    setCols(ws, [25, 14, 12, 22, 18, 50]);

    let ri = 0;
    for (const a of atleti) {
      for (const ref of (a.refertiClinici ?? [])) {
        const r = ws.addRow([nd(a), a.categoria, ref.data, ref.tipo, ref.esito, ref.note ?? ""]);
        styleData(r, ri % 2 === 0);
        const ec = r.getCell(5);
        if (ref.esito === "Positivo") {
          ec.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
          ec.font = { ...DATA_FONT, color: { argb: "FF2E7D32" } };
        } else if (ref.esito === "Negativo") {
          ec.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE8E8" } };
          ec.font = { ...DATA_FONT, color: { argb: "FFC8102E" } };
        } else {
          ec.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } };
          ec.font = { ...DATA_FONT, color: { argb: "FFF57F17" } };
        }
        ri++;
      }
    }
  }

  // ── 4. Programmi (Sessioni) ───────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Programmi", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow([
      "Data", "Atleta", "Categoria", "Fase", "Nome Programma", "Tipo Sessione",
      "Ob. Palestra", "Note Fisioterapia", "Ob. Campo",
      "RPE", "Carico Int.", "Carico Est.", "Durata (min)",
      "Distanza (km)", "Vel. Max (km/h)", "HSR (m)",
      "Accelerazioni", "Decelerazioni", "Sprint", "Pot. Metabolica", "Note Carico",
    ]);
    styleHeader(ws.getRow(1));
    setCols(ws, [12, 25, 14, 18, 25, 14, 32, 32, 32, 8, 10, 10, 12, 12, 14, 10, 12, 12, 10, 14, 30]);

    const sorted = [...programmiAll].sort((a, b) => a.data.localeCompare(b.data));
    sorted.forEach((p, i) => {
      const a = atletaMap.get(p.atletaId);
      const tipo = p.riposo ? "Riposo" : p.assente ? "Assente" : p.squadra ? "Squadra" : "Rehab";
      const r = ws.addRow([
        p.data, a ? nd(a) : "", a?.categoria ?? "",
        p.fase, p.nome, tipo,
        (p.obiettiviPalestra ?? []).join(", "),
        p.noteFisioterapia ?? "",
        (p.obiettiviCampo ?? []).join(", "),
        p.carico?.rpe ?? "", p.carico?.interno ?? "", p.carico?.esterno ?? "",
        p.carico?.durata ?? "", p.carico?.distanzaTotale ?? "", p.carico?.velocitaMax ?? "",
        p.carico?.hsr ?? "", p.carico?.accelerazioni ?? "", p.carico?.decelerazioni ?? "",
        p.carico?.sprint ?? "", p.carico?.potenzaMetabolica ?? "", p.carico?.note ?? "",
      ]);
      styleData(r, i % 2 === 0);
    });
  }

  // ── 5. Esercizi Palestra ──────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Esercizi Palestra", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(["Data", "Atleta", "Categoria", "Fase", "Esercizio", "Serie", "Reps", "Durata", "Carico", "RIR", "VAS", "Note"]);
    styleHeader(ws.getRow(1));
    setCols(ws, [12, 25, 14, 18, 32, 8, 8, 10, 12, 8, 8, 35]);

    let ri = 0;
    for (const p of [...programmiAll].sort((a, b) => a.data.localeCompare(b.data))) {
      const a = atletaMap.get(p.atletaId);
      for (const e of (p.esercizi ?? [])) {
        if (!e.nome) continue;
        const r = ws.addRow([
          p.data, a ? nd(a) : "", a?.categoria ?? "",
          p.fase, e.nome, e.serie, e.reps, e.durata, e.carico, e.rir, e.vas, e.note,
        ]);
        styleData(r, ri % 2 === 0); ri++;
      }
    }
  }

  // ── 6. Esercizi Campo ────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Esercizi Campo", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(["Data", "Atleta", "Categoria", "Fase", "Tipo", "Serie", "Durata", "Descrizione", "VAS"]);
    styleHeader(ws.getRow(1));
    setCols(ws, [12, 25, 14, 18, 24, 8, 10, 42, 8]);

    let ri = 0;
    for (const p of [...programmiAll].sort((a, b) => a.data.localeCompare(b.data))) {
      const a = atletaMap.get(p.atletaId);
      for (const e of (p.esercizicampo ?? [])) {
        if (!e.tipo && !e.descrizione) continue;
        const r = ws.addRow([
          p.data, a ? nd(a) : "", a?.categoria ?? "",
          p.fase, e.tipo, e.serie, e.durata, e.descrizione, e.vas,
        ]);
        styleData(r, ri % 2 === 0); ri++;
      }
    }
  }

  // ── 7. Test Fisici ───────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Test Fisici", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow([
      "Data", "Atleta", "Categoria", "Test",
      "Risultato Dx", "Risultato Sx", "Risultato", "Unità", "Note",
      "Ginocchio Dx", "Anca Sx", "Σ Dx/Sx",
      "Ginocchio Sx", "Anca Dx", "Σ Sx/Dx",
      "Altezza Salto", "Tempo Contatto", "RSI",
      "Tempo (s)", "Livello", "VO2max", "VAM",
    ]);
    styleHeader(ws.getRow(1));
    setCols(ws, [12, 25, 14, 30, 12, 12, 12, 10, 30, 12, 10, 10, 12, 10, 10, 12, 14, 10, 10, 10, 10, 10]);

    let ri = 0;
    for (const p of [...programmiAll].sort((a, b) => a.data.localeCompare(b.data))) {
      const a = atletaMap.get(p.atletaId);
      for (const t of (p.tests ?? [])) {
        if (!t.nome) continue;
        const r = ws.addRow([
          p.data, a ? nd(a) : "", a?.categoria ?? "", t.nome,
          t.risultatoDx ?? "", t.risultatoSx ?? "", t.risultato ?? "",
          t.unita ?? "", t.note ?? "",
          t.ginocchioDx ?? "", t.ancaSx ?? "", t.diffGinocchioDxAncaSx ?? "",
          t.ginocchioSx ?? "", t.ancaDx ?? "", t.diffGinocchioSxAncaDx ?? "",
          t.altezzaSalto ?? "", t.tempoContatto ?? "", t.rsi ?? "",
          t.tempo ?? "", t.livello ?? "", t.vo2max ?? "", t.vam ?? "",
        ]);
        styleData(r, ri % 2 === 0); ri++;
      }
    }
  }

  // ── 8. Carichi ───────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Carichi", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow([
      "Data", "Atleta", "Categoria", "Fase",
      "RPE (1-10)", "Carico Interno", "Carico Esterno",
      "Durata (min)", "Distanza (km)", "Vel. Max (km/h)",
      "HSR (m)", "Vel. >21 km/h", "Vel. >25 km/h",
      "Accelerazioni", "Decelerazioni", "Sprint", "Pot. Metabolica", "Note",
    ]);
    styleHeader(ws.getRow(1));
    setCols(ws, [12, 25, 14, 18, 10, 14, 14, 12, 14, 14, 10, 12, 12, 12, 12, 10, 16, 35]);

    [...programmiAll]
      .filter((p) => p.carico?.rpe || p.carico?.durata || p.carico?.distanzaTotale)
      .sort((a, b) => a.data.localeCompare(b.data))
      .forEach((p, i) => {
        const a = atletaMap.get(p.atletaId);
        const c = p.carico;
        const r = ws.addRow([
          p.data, a ? nd(a) : "", a?.categoria ?? "", p.fase,
          c?.rpe ?? "", c?.interno ?? "", c?.esterno ?? "",
          c?.durata ?? "", c?.distanzaTotale ?? "", c?.velocitaMax ?? "",
          c?.hsr ?? "", c?.velocita21 ?? "", c?.velocita25 ?? "",
          c?.accelerazioni ?? "", c?.decelerazioni ?? "", c?.sprint ?? "",
          c?.potenzaMetabolica ?? "", c?.note ?? "",
        ]);
        styleData(r, i % 2 === 0);
      });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rehab-usc-cremonese-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
