import ExcelJS from "exceljs";
import { loadAtleti, loadProgrammi, calcolaProgressoAuto, nd } from "./store";
import {
  CATEGORIE, PIEDI, TIPI_INFORTUNIO, EVENTI_INFORTUNIO,
  MECCANISMI_INFORTUNIO, CONTATTI_INFORTUNIO, LATI_INFORTUNIO,
  POSIZIONI_INFORTUNIO,
  OBIETTIVI_PALESTRA, OBIETTIVI_CAMPO, TIPI_ESERCIZIO_CAMPO,
  TESTS_PREDEFINITI,
} from "./store";
import type { Atleta, Programma } from "./store";

// ─── Stili ───────────────────────────────────────────────────────────────────

const DARK_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B2B2B" } };
const RED_FILL:  ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC8102E" } };
const ALT_FILL:  ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F7" } };
const HDR_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
const DATA_FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };
const BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: "thin", color: { argb: "FFE0E0E0" } },
  left:   { style: "thin", color: { argb: "FFE0E0E0" } },
  bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
  right:  { style: "thin", color: { argb: "FFE0E0E0" } },
};

function hdr(row: ExcelJS.Row, fill = DARK_FILL) {
  row.eachCell((c) => {
    c.fill = fill; c.font = HDR_FONT;
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = BORDER;
  });
  row.height = 22;
}

function dat(row: ExcelJS.Row, alt: boolean) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.font = DATA_FONT; c.border = BORDER;
    c.alignment = { vertical: "middle" };
    if (alt) c.fill = ALT_FILL;
  });
  row.height = 18;
}

function cols(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ─── Data validation helper ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dv(ws: ExcelJS.Worksheet, range: string, listRange: string) {
  (ws as any).dataValidations.add(range, {
    type: "list",
    allowBlank: true,
    formulae: [listRange],
    showErrorMessage: true,
    error: "Seleziona un valore dall'elenco",
    errorTitle: "Valore non valido",
  });
}

// ─── Liste sheet (hidden, referenced by dropdowns) ────────────────────────────

function buildListeSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet("Liste");
  ws.state = "veryHidden";

  const lists: Array<{ name: string; values: readonly string[] | string[] }> = [
    { name: "Categorie",         values: CATEGORIE },
    { name: "Piedi",             values: PIEDI },
    { name: "Stato",             values: ["Disponibile", "Infortunato"] },
    { name: "TipiInfortunio",    values: TIPI_INFORTUNIO },
    { name: "EventiInfortunio",  values: EVENTI_INFORTUNIO },
    { name: "Meccanismi",        values: MECCANISMI_INFORTUNIO },
    { name: "Contatti",          values: CONTATTI_INFORTUNIO },
    { name: "Lati",              values: LATI_INFORTUNIO },
    { name: "Posizioni",         values: POSIZIONI_INFORTUNIO },
    { name: "ObiettiviPalestra", values: OBIETTIVI_PALESTRA },
    { name: "ObiettiviCampo",    values: OBIETTIVI_CAMPO },
    { name: "TipiEsercizioCampo",values: TIPI_ESERCIZIO_CAMPO },
    { name: "TipiSessione",      values: ["Rehab", "Riposo", "Assente", "Squadra"] },
  ];

  lists.forEach((list, col) => {
    const c = col + 1;
    ws.getCell(1, c).value = list.name;
    ws.getCell(1, c).font = { bold: true };
    list.values.forEach((v, row) => { ws.getCell(row + 2, c).value = v; });
    // Define named range so dropdowns can reference it by column letter
    const colLetter = ws.getColumn(c).letter;
    const last = list.values.length + 1;
    wb.definedNames.add(`Liste!$${colLetter}$2:$${colLetter}$${last}`, list.name);
  });
}

// ─── Riepilogo (formule auto-aggiornanti) ────────────────────────────────────

function buildRiepilogoSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet("Riepilogo");
  ws.views = [{ state: "normal" }];
  cols(ws, [30, 18, 18, 18]);

  // Title
  const t = ws.addRow(["USC Cremonese — Rehab Area"]);
  t.getCell(1).font = { bold: true, size: 16, name: "Arial", color: { argb: "FFC8102E" } };
  t.getCell(1).alignment = { horizontal: "left" };
  t.height = 28;
  ws.addRow([`Generato il: ${new Date().toLocaleDateString("it-IT")}`]).getCell(1).font = { size: 9, name: "Arial", color: { argb: "FF888888" } };
  ws.addRow([]);

  // ── Atleti ──
  const ah = ws.addRow(["Atleti", "Totale", "Infortunati", "Disponibili"]);
  hdr(ah);
  const ar = ws.addRow([
    "Tutti",
    { formula: "=COUNTA(Atleti!A:A)-1" },
    { formula: '=COUNTIF(Atleti!E:E,"Infortunato")' },
    { formula: '=COUNTIF(Atleti!E:E,"Disponibile")' },
  ]);
  dat(ar, false);
  ar.getCell(2).font = { ...DATA_FONT, bold: true };
  ar.getCell(3).font = { ...DATA_FONT, color: { argb: "FFC8102E" }, bold: true };
  ar.getCell(4).font = { ...DATA_FONT, color: { argb: "FF2E7D32" }, bold: true };
  ws.addRow([]);

  // Per categoria
  const ch = ws.addRow(["Per Categoria", "Totale", "Infortunati", "Disponibili"]);
  hdr(ch);
  CATEGORIE.forEach((cat, i) => {
    const r = ws.addRow([
      cat,
      { formula: `=COUNTIF(Atleti!B:B,"${cat}")` },
      { formula: `=COUNTIFS(Atleti!B:B,"${cat}",Atleti!E:E,"Infortunato")` },
      { formula: `=COUNTIFS(Atleti!B:B,"${cat}",Atleti!E:E,"Disponibile")` },
    ]);
    dat(r, i % 2 === 0);
  });
  ws.addRow([]);

  // ── Programmi ──
  const ph = ws.addRow(["Programmi", "Totale", "Rehab", "Riposo/Assente"]);
  hdr(ph);
  const pr = ws.addRow([
    "Sessioni",
    { formula: "=COUNTA(Programmi!A:A)-1" },
    { formula: '=COUNTIF(Programmi!F:F,"Rehab")' },
    { formula: '=COUNTIFS(Programmi!F:F,"Riposo")+COUNTIF(Programmi!F:F,"Assente")' },
  ]);
  dat(pr, false);
  ws.addRow([]);

  // ── Infortuni ──
  const ih = ws.addRow(["Infortuni (storico)", "Totale", "Attivi", "Conclusi"]);
  hdr(ih);
  const ir = ws.addRow([
    "Tutti",
    { formula: "=COUNTA(Infortuni!A:A)-1" },
    { formula: '=COUNTIF(Infortuni!G:G,"Sì")' },
    { formula: '=COUNTIF(Infortuni!G:G,"No")' },
  ]);
  dat(ir, false);
  ws.addRow([]);

  // Per tipo infortunio
  const ith = ws.addRow(["Per Tipo Infortunio", "N°", "", ""]);
  hdr(ith);
  TIPI_INFORTUNIO.slice(0, 10).forEach((tipo, i) => {
    const r = ws.addRow([tipo, { formula: `=COUNTIF(Infortuni!C:C,"${tipo}")` }, "", ""]);
    dat(r, i % 2 === 0);
  });
}

// ─── Atleti sheet ────────────────────────────────────────────────────────────

function buildAtletiSheet(wb: ExcelJS.Workbook, atleti: Atleta[]): void {
  const ws = wb.addWorksheet("Atleti", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = [
    "Nome",               // A
    "Categoria",          // B
    "Posizione",          // C
    "Piede Dominante",    // D
    "Stato",              // E
    "Progresso %",        // F
    "Diagnosi/Infortunio",// G
    "Tipo Infortunio",    // H
    "Inizio Rehab",       // I
    "Fine Rehab",         // J
    "Giorni Rehab",       // K (formula)
    "Evento",             // L
    "Meccanismo",         // M
    "Contatto",           // N
    "Lato",               // O
    "Pos. Infortunio",    // P
    "OSIICS",             // Q
    "Fisioterapista",     // R
    "Preparatore Atletico",// S
    "Telefono",           // T
    "Email",              // U
    "Note",               // V
    "Peso (kg)",          // W
    "Altezza (cm)",       // X
    "Alt. da Seduto (cm)",// Y
    "Plicometrie",        // Z
    "Data Nascita",       // AA
  ];
  ws.addRow(headers);
  hdr(ws.getRow(1));
  cols(ws, [25, 14, 18, 14, 12, 12, 35, 30, 12, 12, 12, 14, 25, 18, 12, 20, 14, 22, 22, 16, 26, 30, 10, 12, 16, 14, 14]);

  // Date format for columns I, J
  ws.getColumn("I").numFmt = "dd/mm/yyyy";
  ws.getColumn("J").numFmt = "dd/mm/yyyy";
  ws.getColumn("AA").numFmt = "dd/mm/yyyy";

  const MAX_ROWS = 1000;

  atleti.forEach((a, i) => {
    const rn = i + 2;
    const progresso = a.progressoManuale !== undefined ? a.progressoManuale : calcolaProgressoAuto(a);
    const row = ws.addRow([
      nd(a), a.categoria, a.posizione, a.piedeDominante,
      a.stato, progresso, a.infortunio, a.tipoInfortunio ?? "",
      a.inizioRehab ? new Date(a.inizioRehab + "T12:00") : "",
      a.fineRehab ? new Date(a.fineRehab + "T12:00") : "",
      { formula: `=IF(AND(I${rn}<>""),IF(J${rn}<>"",J${rn}-I${rn},TODAY()-I${rn}),"")` },
      a.evento ?? "", a.meccanismo ?? "", a.contatto ?? "",
      a.lato ?? "", a.posizioneInfortunio ?? "",
      a.osiicsCodice ? `${a.osiicsCodice} – ${a.osiicsDescrizione ?? ""}` : "",
      a.fisioterapista, a.preparatoreAtletico,
      a.telefono, a.email, a.note,
      a.peso ?? "", a.altezza ?? "", a.altezzaDaSeduto ?? "", a.plicometrieMedie ?? "",
      a.dataNascita ? new Date(a.dataNascita + "T12:00") : "",
    ]);
    dat(row, i % 2 === 0);
    // Color Stato cell
    const sc = row.getCell(5);
    if (a.stato === "Infortunato") {
      sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE8E8" } };
      sc.font = { ...DATA_FONT, color: { argb: "FFC8102E" }, bold: true };
    } else {
      sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
      sc.font = { ...DATA_FONT, color: { argb: "FF2E7D32" }, bold: true };
    }
    // Format Giorni Rehab as number
    row.getCell(11).numFmt = "0";
  });

  // ── Data validation dropdowns ─────────────────────────────────────────────
  const r2 = `B2:B${MAX_ROWS}`;
  dv(ws, r2, "Liste!$A$2:$A$10");           // Categorie
  dv(ws, `D2:D${MAX_ROWS}`, "Liste!$B$2:$B$4");   // Piedi
  dv(ws, `E2:E${MAX_ROWS}`, "Liste!$C$2:$C$3");   // Stato
  dv(ws, `H2:H${MAX_ROWS}`, "Liste!$D$2:$D$18");  // Tipo Infortunio
  dv(ws, `L2:L${MAX_ROWS}`, "Liste!$E$2:$E$4");   // Evento
  dv(ws, `M2:M${MAX_ROWS}`, "Liste!$F$2:$F$20");  // Meccanismo
  dv(ws, `N2:N${MAX_ROWS}`, "Liste!$G$2:$G$4");   // Contatto
  dv(ws, `O2:O${MAX_ROWS}`, "Liste!$H$2:$H$5");   // Lato
  dv(ws, `P2:P${MAX_ROWS}`, "Liste!$I$2:$I$20");  // Posizione Infortunio
}

// ─── Infortuni sheet ─────────────────────────────────────────────────────────

function buildInfortuniSheet(wb: ExcelJS.Workbook, atleti: Atleta[]): void {
  const ws = wb.addWorksheet("Infortuni", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([
    "Atleta", "Categoria", "Tipo Infortunio", "Diagnosi",
    "Inizio Rehab", "Fine Rehab", "Attivo",
    "Evento", "Meccanismo", "Contatto", "Lato", "Pos. Infortunio", "OSIICS", "Note",
  ]);
  hdr(ws.getRow(1));
  cols(ws, [25, 14, 30, 35, 12, 12, 10, 14, 25, 18, 12, 20, 12, 35]);
  ws.getColumn("E").numFmt = "dd/mm/yyyy";
  ws.getColumn("F").numFmt = "dd/mm/yyyy";

  let ri = 0;
  for (const a of atleti) {
    if (a.stato === "Infortunato" && a.infortunio) {
      const r = ws.addRow([
        nd(a), a.categoria, a.tipoInfortunio ?? "", a.infortunio,
        a.inizioRehab ? new Date(a.inizioRehab + "T12:00") : "",
        a.fineRehab ? new Date(a.fineRehab + "T12:00") : "",
        "Sì",
        a.evento ?? "", a.meccanismo ?? "", a.contatto ?? "",
        a.lato ?? "", a.posizioneInfortunio ?? "", a.osiicsCodice ?? "", a.note,
      ]);
      dat(r, ri % 2 === 0); ri++;
    }
    for (const inf of (a.storicoInfortuni ?? [])) {
      const r = ws.addRow([
        nd(a), a.categoria, inf.tipo ?? "", inf.diagnosi,
        inf.inizioRehab ? new Date(inf.inizioRehab + "T12:00") : "",
        inf.fineRehab ? new Date(inf.fineRehab + "T12:00") : "",
        inf.attivo ? "Sì" : "No",
        inf.evento ?? "", inf.meccanismo ?? "", inf.contatto ?? "",
        inf.lato ?? "", inf.posizioneInfortunio ?? "", inf.osiicsCodice ?? "", inf.note ?? "",
      ]);
      dat(r, ri % 2 === 0); ri++;
    }
  }

  const MAX = 1000;
  dv(ws, `C2:C${MAX}`, "Liste!$D$2:$D$18");
  dv(ws, `G2:G${MAX}`, '"Sì,No"');
  dv(ws, `H2:H${MAX}`, "Liste!$E$2:$E$4");
  dv(ws, `I2:I${MAX}`, "Liste!$F$2:$F$20");
  dv(ws, `J2:J${MAX}`, "Liste!$G$2:$G$4");
  dv(ws, `K2:K${MAX}`, "Liste!$H$2:$H$5");
  dv(ws, `L2:L${MAX}`, "Liste!$I$2:$I$20");
}

// ─── Programmi sheet ─────────────────────────────────────────────────────────

function buildProgrammiSheet(
  wb: ExcelJS.Workbook,
  atleti: Atleta[],
  programmi: Programma[],
): void {
  const ws = wb.addWorksheet("Programmi", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([
    "Data", "Atleta", "Categoria", "Fase", "Nome Programma", "Tipo Sessione",
    "Ob. Palestra", "Note Fisioterapia", "Ob. Campo",
    "RPE (1-10)", "Carico Int.", "Carico Est.", "Durata (min)",
    "Distanza (km)", "Vel. Max (km/h)", "HSR (m)",
    "Accelerazioni", "Decelerazioni", "Sprint", "Pot. Metabolica", "Note Carico",
  ]);
  hdr(ws.getRow(1));
  cols(ws, [12, 25, 14, 18, 25, 14, 32, 32, 32, 9, 10, 10, 12, 12, 14, 10, 12, 12, 10, 14, 30]);
  ws.getColumn("A").numFmt = "dd/mm/yyyy";

  const atletaMap = new Map(atleti.map((a) => [a.id, a]));
  const sorted = [...programmi].sort((a, b) => a.data.localeCompare(b.data));
  sorted.forEach((p, i) => {
    const a = atletaMap.get(p.atletaId);
    const tipo = p.riposo ? "Riposo" : p.assente ? "Assente" : p.squadra ? "Squadra" : "Rehab";
    const r = ws.addRow([
      p.data ? new Date(p.data + "T12:00") : "",
      a ? nd(a) : "", a?.categoria ?? "",
      p.fase, p.nome, tipo,
      (p.obiettiviPalestra ?? []).join(", "),
      p.noteFisioterapia ?? "",
      (p.obiettiviCampo ?? []).join(", "),
      p.carico?.rpe ?? "", p.carico?.interno ?? "", p.carico?.esterno ?? "",
      p.carico?.durata ?? "", p.carico?.distanzaTotale ?? "", p.carico?.velocitaMax ?? "",
      p.carico?.hsr ?? "", p.carico?.accelerazioni ?? "", p.carico?.decelerazioni ?? "",
      p.carico?.sprint ?? "", p.carico?.potenzaMetabolica ?? "", p.carico?.note ?? "",
    ]);
    dat(r, i % 2 === 0);
  });

  dv(ws, `C2:C1000`, "Liste!$A$2:$A$10");
  dv(ws, `F2:F1000`, "Liste!$M$2:$M$6");
}

// ─── Esercizi Palestra sheet ──────────────────────────────────────────────────

function buildEserciziPalestraSheet(
  wb: ExcelJS.Workbook,
  atleti: Atleta[],
  programmi: Programma[],
): void {
  const ws = wb.addWorksheet("Esercizi Palestra", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(["Data", "Atleta", "Categoria", "Fase", "Esercizio", "Serie", "Reps", "Durata", "Carico", "RIR", "VAS", "Note"]);
  hdr(ws.getRow(1));
  cols(ws, [12, 25, 14, 18, 32, 8, 8, 10, 12, 8, 8, 35]);
  ws.getColumn("A").numFmt = "dd/mm/yyyy";

  const atletaMap = new Map(atleti.map((a) => [a.id, a]));
  let ri = 0;
  for (const p of [...programmi].sort((a, b) => a.data.localeCompare(b.data))) {
    const a = atletaMap.get(p.atletaId);
    for (const e of (p.esercizi ?? [])) {
      if (!e.nome) continue;
      const r = ws.addRow([
        p.data ? new Date(p.data + "T12:00") : "",
        a ? nd(a) : "", a?.categoria ?? "",
        p.fase, e.nome, e.serie, e.reps, e.durata, e.carico, e.rir, e.vas, e.note,
      ]);
      dat(r, ri % 2 === 0); ri++;
    }
  }
}

// ─── Esercizi Campo sheet ─────────────────────────────────────────────────────

function buildEserciziCampoSheet(
  wb: ExcelJS.Workbook,
  atleti: Atleta[],
  programmi: Programma[],
): void {
  const ws = wb.addWorksheet("Esercizi Campo", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(["Data", "Atleta", "Categoria", "Fase", "Tipo", "Serie", "Durata", "Descrizione", "VAS"]);
  hdr(ws.getRow(1));
  cols(ws, [12, 25, 14, 18, 24, 8, 10, 42, 8]);
  ws.getColumn("A").numFmt = "dd/mm/yyyy";

  const atletaMap = new Map(atleti.map((a) => [a.id, a]));
  let ri = 0;
  for (const p of [...programmi].sort((a, b) => a.data.localeCompare(b.data))) {
    const a = atletaMap.get(p.atletaId);
    for (const e of (p.esercizicampo ?? [])) {
      if (!e.tipo && !e.descrizione) continue;
      const r = ws.addRow([
        p.data ? new Date(p.data + "T12:00") : "",
        a ? nd(a) : "", a?.categoria ?? "",
        p.fase, e.tipo, e.serie, e.durata, e.descrizione, e.vas,
      ]);
      dat(r, ri % 2 === 0); ri++;
    }
  }

  dv(ws, `E2:E1000`, "Liste!$L$2:$L$12");
}

// ─── Test Fisici sheet ────────────────────────────────────────────────────────

function buildTestSheet(
  wb: ExcelJS.Workbook,
  atleti: Atleta[],
  programmi: Programma[],
): void {
  const ws = wb.addWorksheet("Test Fisici", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([
    "Data", "Atleta", "Categoria", "Test",
    "Risultato Dx", "Risultato Sx", "Risultato", "Unità", "Note",
    "Ginocchio Dx°", "Anca Sx°", "Σ Dx/Sx",
    "Ginocchio Sx°", "Anca Dx°", "Σ Sx/Dx",
    "Altezza Salto (cm)", "Tempo Contatto (ms)", "RSI",
    "Tempo (s)", "Livello", "VO2max", "VAM",
  ]);
  hdr(ws.getRow(1));
  cols(ws, [12, 25, 14, 30, 12, 12, 12, 10, 30, 13, 10, 10, 13, 10, 10, 16, 18, 10, 10, 10, 10, 10]);
  ws.getColumn("A").numFmt = "dd/mm/yyyy";

  const atletaMap = new Map(atleti.map((a) => [a.id, a]));
  let ri = 0;
  for (const p of [...programmi].sort((a, b) => a.data.localeCompare(b.data))) {
    const a = atletaMap.get(p.atletaId);
    for (const t of (p.tests ?? [])) {
      if (!t.nome) continue;
      const r = ws.addRow([
        p.data ? new Date(p.data + "T12:00") : "",
        a ? nd(a) : "", a?.categoria ?? "", t.nome,
        t.risultatoDx ?? "", t.risultatoSx ?? "", t.risultato ?? "",
        t.unita ?? "", t.note ?? "",
        t.ginocchioDx ?? "", t.ancaSx ?? "", t.diffGinocchioDxAncaSx ?? "",
        t.ginocchioSx ?? "", t.ancaDx ?? "", t.diffGinocchioSxAncaDx ?? "",
        t.altezzaSalto ?? "", t.tempoContatto ?? "", t.rsi ?? "",
        t.tempo ?? "", t.livello ?? "", t.vo2max ?? "", t.vam ?? "",
      ]);
      dat(r, ri % 2 === 0); ri++;
    }
  }

  dv(ws, `D2:D1000`, `Liste!$K$2:$K$${TESTS_PREDEFINITI.length + 1}`);
}

// ─── Carichi sheet ────────────────────────────────────────────────────────────

function buildCarichiSheet(
  wb: ExcelJS.Workbook,
  atleti: Atleta[],
  programmi: Programma[],
): void {
  const ws = wb.addWorksheet("Carichi", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([
    "Data", "Atleta", "Categoria", "Fase",
    "RPE (1-10)", "Carico Interno", "Carico Esterno",
    "Durata (min)", "Distanza (km)", "Vel. Max (km/h)",
    "HSR (m)", "Vel. >21 km/h", "Vel. >25 km/h",
    "Accelerazioni", "Decelerazioni", "Sprint", "Pot. Metabolica", "Note",
  ]);
  hdr(ws.getRow(1));
  cols(ws, [12, 25, 14, 18, 10, 14, 14, 12, 14, 14, 10, 12, 12, 12, 12, 10, 16, 35]);
  ws.getColumn("A").numFmt = "dd/mm/yyyy";

  const atletaMap = new Map(atleti.map((a) => [a.id, a]));
  [...programmi]
    .filter((p) => p.carico?.rpe || p.carico?.durata || p.carico?.distanzaTotale)
    .sort((a, b) => a.data.localeCompare(b.data))
    .forEach((p, i) => {
      const a = atletaMap.get(p.atletaId);
      const c = p.carico;
      const r = ws.addRow([
        p.data ? new Date(p.data + "T12:00") : "",
        a ? nd(a) : "", a?.categoria ?? "", p.fase,
        c?.rpe ?? "", c?.interno ?? "", c?.esterno ?? "",
        c?.durata ?? "", c?.distanzaTotale ?? "", c?.velocitaMax ?? "",
        c?.hsr ?? "", c?.velocita21 ?? "", c?.velocita25 ?? "",
        c?.accelerazioni ?? "", c?.decelerazioni ?? "", c?.sprint ?? "",
        c?.potenzaMetabolica ?? "", c?.note ?? "",
      ]);
      dat(r, i % 2 === 0);
    });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function esportaExcel(): Promise<void> {
  const atleti = await loadAtleti();
  const programmiAll: Programma[] = [];
  for (const a of atleti) {
    const pp = await loadProgrammi(a.id);
    programmiAll.push(...pp);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "USC Cremonese – Rehab Area";
  wb.created = new Date();
  wb.modified = new Date();

  // Build sheets in order
  buildListeSheet(wb);
  buildRiepilogoSheet(wb);
  buildAtletiSheet(wb, atleti);
  buildInfortuniSheet(wb, atleti);
  buildProgrammiSheet(wb, atleti, programmiAll);
  buildEserciziPalestraSheet(wb, atleti, programmiAll);
  buildEserciziCampoSheet(wb, atleti, programmiAll);
  buildTestSheet(wb, atleti, programmiAll);
  buildCarichiSheet(wb, atleti, programmiAll);

  // Set Riepilogo as active sheet (cast needed — type def is incomplete)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (wb as any).views = [{ activeTab: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rehab-usc-cremonese-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
