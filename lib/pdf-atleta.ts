import { nd, type Atleta, type Programma, type TestFisiometrico } from "@/lib/store";

async function getLogoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch("/logo.png"); if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onloadend = () => res(rd.result as string); rd.onerror = rej; rd.readAsDataURL(blob); });
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

export async function esportaPDFAtleta(atleta: Atleta, programmi: Programma[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });
  const red: [number, number, number] = [200, 16, 46];
  const dark: [number, number, number] = [43, 43, 43];
  const gray: [number, number, number] = [130, 130, 130];
  const logoDataUrl = await getLogoDataUrl();
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
          const val = [t.risultato, t.risultatoSx ? `Sx ${t.risultatoSx}` : "", t.risultatoDx ? `Dx ${t.risultatoDx}` : "", t.tempo ? `Tempo: ${t.tempo}s` : "", t.livello ? `Liv: ${t.livello}` : "", t.vo2max ? `Vo2Max: ${t.vo2max}` : "", t.vam ? `VAM: ${t.vam}` : "", t.ginocchioDx ? `Gin.Dx: ${t.ginocchioDx}°` : "", t.ancaSx ? `Anca Sx: ${t.ancaSx}°` : "", t.diffGinocchioDxAncaSx ? `Δ: ${t.diffGinocchioDxAncaSx}°` : "", t.ginocchioSx ? `Gin.Sx: ${t.ginocchioSx}°` : "", t.ancaDx ? `Anca Dx: ${t.ancaDx}°` : "", t.diffGinocchioSxAncaDx ? `Δ: ${t.diffGinocchioSxAncaDx}°` : ""].filter(Boolean).join(" / ");
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
      y = secTitle("Andamento Test", y);

      const checkPg = (needed: number) => {
        if (y + needed > H - 18) {
          doc.addPage();
          addHeader(`${nd(atleta)}  ·  ${atleta.categoria}`);
          y = HDR + 8;
        }
      };

      const testColors: [number, number, number][] = [
        [200, 16, 46], [37, 99, 235], [5, 150, 105], [124, 58, 237],
        [234, 88, 12], [2, 132, 199], [219, 39, 119], [75, 85, 99],
      ];

      testNames.forEach((testName, testIdx) => {
        const entries = testsByName[testName];
        const isSprintTempo = ["Sprint 10m", "Sprint 20m", "Sprint 30m", "10x100m"].includes(testName);
        const isGaconIFT = testName === "Gacon" || testName === "IFT 30-15";
        const isDropJump = testName === "Drop Jump";
        const isSLDropJump = testName === "SL Drop Jump";
        const isJurdan = testName === "Jurdan";
        const isCMJ = ["CMJ", "CMJ Arms", "Squat Jump", "Broad Jump"].includes(testName);
        const hasSxDx = !isJurdan && entries.some((e) => e.test.risultatoSx || e.test.risultatoDx);

        const color = testColors[testIdx % testColors.length];
        const [cr, cg, cb] = color;

        const mainData = entries
          .map((e) => { const v = getTestMainValue(e.test); return v !== null ? { dateLabel: e.dateLabel, value: v } : null; })
          .filter((d): d is { dateLabel: string; value: number } => d !== null);

        const tableRows = entries.length;
        const needed = (mainData.length >= 2 ? 58 : 0) + tableRows * 5.5 + 22;
        checkPg(needed);

        // Test name banner
        doc.setFillColor(250, 250, 250); doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3);
        doc.rect(M, y, W - 2 * M, 7, "FD");
        doc.setFillColor(...color); doc.rect(M, y, 2.5, 7, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...color);
        doc.text(testName, M + 6, y + 4.8);
        y += 11;

        // Line chart
        if (mainData.length >= 2) {
          const cX = M; const cW = W - 2 * M; const cH = 40; const cY = y;
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
          const gX = (i: number) => plotX + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
          const gY = (v: number) => plotY + plotH - ((v - minV) / range) * plotH;

          const lr = Math.round(cr * 0.12 + 255 * 0.88);
          const lg = Math.round(cg * 0.12 + 255 * 0.88);
          const lb = Math.round(cb * 0.12 + 255 * 0.88);
          doc.setFillColor(lr, lg, lb);
          const botY2 = plotY + plotH;
          const segs: [number, number][] = [[0, gY(mainData[0].value) - botY2]];
          for (let i = 1; i < n; i++) segs.push([gX(i) - gX(i - 1), gY(mainData[i].value) - gY(mainData[i - 1].value)]);
          segs.push([0, botY2 - gY(mainData[n - 1].value)]);
          segs.push([gX(0) - gX(n - 1), 0]);
          (doc as any).lines(segs, gX(0), botY2, [1, 1], "F", true);

          const avg = vals.reduce((a, b) => a + b, 0) / n;
          doc.setDrawColor(...gray); doc.setLineWidth(0.4); doc.setLineDashPattern([1.5, 1.5], 0);
          doc.line(plotX, gY(avg), plotX + plotW, gY(avg));
          doc.setLineDashPattern([], 0);

          doc.setDrawColor(...color); doc.setLineWidth(0.9);
          for (let i = 0; i < n - 1; i++) doc.line(gX(i), gY(mainData[i].value), gX(i + 1), gY(mainData[i + 1].value));
          doc.setFillColor(...color); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4);
          mainData.forEach((d, i) => doc.circle(gX(i), gY(d.value), i === n - 1 ? 1.3 : 1, "FD"));

          doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
          const step = n <= 15 ? 1 : Math.ceil(n / 15);
          mainData.forEach((d, i) => { if (i % step === 0) doc.text(d.dateLabel, gX(i), cY + cH + 4, { align: "center" }); });

          const yLbl = isSprintTempo ? "Tempo (s)" : isGaconIFT ? "Vo2Max (ml/kg/min)" : isDropJump ? "RSI" : isSLDropJump ? "RSI medio" : isJurdan ? "Gin.Dx (°)" : isCMJ ? "Altezza (cm)" : hasSxDx ? "Media Sx/Dx" : "Valore";
          doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...color);
          doc.text(yLbl, plotX, plotY - 1.5);

          y = cY + cH + 9;
        }

        // Data table
        let head: string[];
        let tableBody: string[][];

        if (isDropJump) {
          head = ["Data", "Altezza (cm)", "Contatto (s)", "RSI", "Δ%"];
          tableBody = entries.map((e, i) => {
            const delta = _calcolaDelta(e.test, i > 0 ? entries[i - 1].test : null);
            return [e.dateFull, e.test.altezzaSalto || "—", e.test.tempoContatto || "—", e.test.rsi || "—", delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"];
          });
        } else if (isSLDropJump) {
          head = ["Data", "RSI Sx", "RSI Dx", "Asimmetria %", "Δ%"];
          tableBody = entries.map((e, i) => {
            const delta = _calcolaDelta(e.test, i > 0 ? entries[i - 1].test : null);
            const asim = _calcolaAsimmetria(e.test.rsiSx ?? "", e.test.rsiDx ?? "");
            return [e.dateFull, e.test.rsiSx || "—", e.test.rsiDx || "—", asim !== null ? `${asim.toFixed(1)}%` : "—", delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"];
          });
        } else if (isSprintTempo) {
          head = ["Data", "Tempo (s)", "Δ%"];
          tableBody = entries.map((e, i) => {
            const delta = _calcolaDelta(e.test, i > 0 ? entries[i - 1].test : null);
            return [e.dateFull, e.test.tempo || "—", delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"];
          });
        } else if (isGaconIFT) {
          head = ["Data", "Livello", "Vo2Max (ml/kg/min)", "VAM (km/h)", "Δ%"];
          tableBody = entries.map((e, i) => {
            const delta = _calcolaDelta(e.test, i > 0 ? entries[i - 1].test : null);
            return [e.dateFull, e.test.livello || "—", e.test.vo2max || "—", e.test.vam || "—", delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"];
          });
        } else if (isJurdan) {
          head = ["Data", "Gin.Dx (°)", "Anca Sx (°)", "Δ Dx/Sx (°)", "Gin.Sx (°)", "Anca Dx (°)", "Δ Sx/Dx (°)"];
          tableBody = entries.map((e) => {
            const gDx = parseFloat(e.test.ginocchioDx ?? ""), aSx = parseFloat(e.test.ancaSx ?? "");
            const gSx = parseFloat(e.test.ginocchioSx ?? ""), aDx = parseFloat(e.test.ancaDx ?? "");
            const d1 = e.test.diffGinocchioDxAncaSx ?? ((!isNaN(gDx) && !isNaN(aSx)) ? Math.abs(gDx - aSx).toFixed(1) : "—");
            const d2 = e.test.diffGinocchioSxAncaDx ?? ((!isNaN(gSx) && !isNaN(aDx)) ? Math.abs(gSx - aDx).toFixed(1) : "—");
            return [e.dateFull, e.test.ginocchioDx || "—", e.test.ancaSx || "—", d1, e.test.ginocchioSx || "—", e.test.ancaDx || "—", d2];
          });
        } else if (isCMJ) {
          head = ["Data", `Altezza (cm)`, "Δ%"];
          tableBody = entries.map((e, i) => {
            const delta = _calcolaDelta(e.test, i > 0 ? entries[i - 1].test : null);
            return [e.dateFull, e.test.altezzaSalto || "—", delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"];
          });
        } else if (hasSxDx) {
          head = ["Data", `Arto Sx${entries[0]?.test.unita ? ` (${entries[0].test.unita})` : ""}`, `Arto Dx${entries[0]?.test.unita ? ` (${entries[0].test.unita})` : ""}`, "Asimmetria %", "Δ%"];
          tableBody = entries.map((e, i) => {
            const delta = _calcolaDelta(e.test, i > 0 ? entries[i - 1].test : null);
            const asim = _calcolaAsimmetria(e.test.risultatoSx, e.test.risultatoDx);
            return [e.dateFull, e.test.risultatoSx || "—", e.test.risultatoDx || "—", asim !== null ? `${asim.toFixed(1)}%` : "—", delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"];
          });
        } else {
          head = ["Data", `Risultato${entries[0]?.test.unita ? ` (${entries[0].test.unita})` : ""}`, "Δ%"];
          tableBody = entries.map((e, i) => {
            const delta = _calcolaDelta(e.test, i > 0 ? entries[i - 1].test : null);
            return [e.dateFull, e.test.risultato || "—", delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"];
          });
        }

        const deltaCol = head.length - 1;
        autoTable(doc, {
          startY: y,
          head: [head],
          body: tableBody,
          headStyles: { fillColor: color, textColor: [255, 255, 255] as [number, number, number], fontSize: 6.5, halign: "center" as const, valign: "middle" as const },
          bodyStyles: { fontSize: 7, cellPadding: 2, halign: "center" as const, valign: "middle" as const },
          alternateRowStyles: { fillColor: [250, 250, 250] as [number, number, number] },
          margin: { left: M, right: M },
          columnStyles: { 0: { halign: "left" as const, cellWidth: 26 } },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === deltaCol) {
              const v = parseFloat(String(data.cell.raw));
              if (!isNaN(v)) {
                const good = isSprintTempo ? v < 0 : v > 0;
                data.cell.styles.textColor = good ? [5, 150, 105] : [220, 38, 38];
                data.cell.styles.fontStyle = "bold";
              }
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      });
    }
  }

  addFooter();
  doc.save(`${nd(atleta).replace(/ /g, "_")}_rehab.pdf`);
}
