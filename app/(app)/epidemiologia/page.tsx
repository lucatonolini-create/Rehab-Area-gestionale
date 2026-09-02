"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, FileText, Upload, Trash2, Users, TrendingUp, Clock, X, AlertTriangle } from "lucide-react";
import {
  loadEpiMonthly, upsertEpiMonthly, deleteEpiMonthly,
  loadAtleti, loadAllDettagliSituazionali,
  CATEGORIE, TIPI_INFORTUNIO,
  type Categoria, type EpiMonthlyRecord, type EpiMonthlyEntry,
  type Atleta, type DettaglioSituazionaleData,
} from "@/lib/store";

const MESI_FULL = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

// ── CSV Parser ────────────────────────────────────────────────────────────────
// ── Column auto-detection ─────────────────────────────────────────────────────
type ColMap = { data: number; atleta: number; presente: number; minutaggio: number; rpe: number; presenteInverted: boolean };

function detectColumns(headers: string[]): ColMap {
  const h = headers.map(s => s.trim().toLowerCase().replace(/[^a-zàèéìòù0-9]/g, ""));
  const find = (...keys: RegExp[]) => h.findIndex(c => keys.some(k => k.test(c)));

  const dataIdx       = find(/^(data|date|giorno|day|dt)$/);
  const atletaIdx     = find(/^(atleta|nome|giocatore|player|nominativo|cognome|surname|name)$/);
  const presenteIdx   = find(/^(presente|presenza|presenze|presence|partecipazione|p)$/);
  const assenteIdx    = find(/^(assente|assenza|absent)$/);
  const minutaggioIdx = find(/^(minutaggio|minuti|minutes?|min|durata|tempoallenamento|loadminutes?)$/);
  const rpeIdx        = find(/^(rpe|cr10|borg|caricointerno|sforzo|effort|perceivedexertion)$/);

  // If no header detected, fall back to positional defaults (col 0-4)
  const noHeaders = [dataIdx, atletaIdx, presenteIdx, assenteIdx].every(i => i === -1);
  if (noHeaders) return { data: 0, atleta: 1, presente: 2, minutaggio: 3, rpe: 4, presenteInverted: false };

  return {
    data:             dataIdx       >= 0 ? dataIdx       : 0,
    atleta:           atletaIdx     >= 0 ? atletaIdx     : 1,
    presente:         presenteIdx   >= 0 ? presenteIdx   : (assenteIdx >= 0 ? assenteIdx : 2),
    minutaggio:       minutaggioIdx >= 0 ? minutaggioIdx : -1,
    rpe:              rpeIdx        >= 0 ? rpeIdx        : -1,
    presenteInverted: presenteIdx   < 0  && assenteIdx   >= 0,
  };
}

function parseDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split("/"); return `${y}-${m}-${d}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, "-");
  if (/^\d{5,6}$/.test(s)) { // Excel serial
    const js = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    return js.toISOString().slice(0, 10);
  }
  return s;
}

function parsePresente(raw: string, inverted: boolean): boolean {
  const p = raw.toLowerCase().trim();
  const yes = p === "1" || p === "sì" || p === "si" || p === "true" || p === "vero" || p === "presenza" || p === "yes" || p === "x";
  return inverted ? !yes : yes;
}

function buildEntry(cols: string[], map: ColMap): EpiMonthlyEntry | null {
  const get = (i: number) => (i >= 0 && i < cols.length ? cols[i] : "");
  const dataRaw   = get(map.data);
  const atletaRaw = get(map.atleta);
  if (!dataRaw || !atletaRaw.trim()) return null;
  const data        = parseDate(dataRaw);
  const presente    = parsePresente(get(map.presente), map.presenteInverted);
  const minRaw      = get(map.minutaggio);
  const rpeRaw      = get(map.rpe);
  const minutaggio  = minRaw ? parseFloat(minRaw.replace(",", ".")) : undefined;
  const rpe         = rpeRaw ? parseFloat(rpeRaw.replace(",", ".")) : undefined;
  return {
    data,
    atleta:    atletaRaw.trim(),
    presente,
    minutaggio: minutaggio != null && !isNaN(minutaggio) ? minutaggio : undefined,
    rpe:        rpe        != null && !isNaN(rpe)        ? rpe        : undefined,
  };
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCSV(text: string): EpiMonthlyEntry[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => l.split(/[,;|\t]/).map(c => c.trim().replace(/^["']|["']$/g, ""));
  const map = detectColumns(split(lines[0]));
  return lines.slice(1).flatMap(row => {
    const entry = buildEntry(split(row), map);
    return entry ? [entry] : [];
  });
}

// ── Excel Parser ──────────────────────────────────────────────────────────────
async function parseExcel(buffer: ArrayBuffer): Promise<EpiMonthlyEntry[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "YYYY-MM-DD" }) as string[][];
  if (rows.length < 2) return [];
  const map = detectColumns(rows[0].map(c => String(c ?? "")));
  return rows.slice(1).flatMap(row => {
    const entry = buildEntry(row.map(c => String(c ?? "").trim()), map);
    return entry ? [entry] : [];
  });
}

// ── PDF Text Parser ───────────────────────────────────────────────────────────
async function parsePDF(buffer: ArrayBuffer): Promise<EpiMonthlyEntry[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let allText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    allText += content.items.map((it: any) => it.str).join(" ") + "\n";
  }
  // attempt CSV parse on extracted text
  return parseCSV(allText);
}

// ── PDF Export ────────────────────────────────────────────────────────────────
async function esportaPDFEpi(params: {
  filtroCat: string; filtroAnno: string; filtroMese: string;
  kpi: { sessioni: number; presenzaMedia: number; rpeMedia: number; minutiMedi: number };
  catData: { cat: string; sessioni: number; presenzaMedia: number; rpeMedia: number; minutiMedi: number }[];
  monthlyData: { label: string; presenzaMedia: number; rpeMedia: number; sessioni: number }[];
}) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();
  const red: [number, number, number] = [200, 16, 46];
  const dark: [number, number, number] = [43, 43, 43];
  const gray: [number, number, number] = [130, 130, 130];
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const HDR = 22;

  function addHeader() {
    doc.setFillColor(...red); doc.rect(0, 0, W, HDR, "F");
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("U.S. Cremonese – Epidemiologia Carichi di Lavoro", 14, 14);
    const parts: string[] = [];
    if (params.filtroCat !== "Tutte") parts.push(params.filtroCat);
    if (params.filtroAnno !== "Tutti") parts.push(params.filtroAnno);
    if (params.filtroMese !== "Tutti") parts.push(MESI_FULL[parseInt(params.filtroMese) - 1]);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 220, 220);
    doc.text("Stagione 2026-2027", W - 14, 9, { align: "right" });
    doc.setTextColor(255, 255, 255);
    doc.text(parts.length > 0 ? parts.join("  •  ") : "Tutti i dati", W - 14, 14, { align: "right" });
    doc.setTextColor(...dark);
  }

  function secTitle(title: string, y: number) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...gray);
    doc.text(title.toUpperCase(), 14, y);
    doc.setDrawColor(...gray); doc.setLineWidth(0.3);
    doc.line(14, y + 1.5, W - 14, y + 1.5);
    doc.setTextColor(...dark);
    return y + 8;
  }

  addHeader();
  let y = HDR + 10;

  y = secTitle("Riepilogo", y);
  autoTable(doc, {
    startY: y,
    body: [
      ["File mensili analizzati", String(params.kpi.sessioni), "Presenza media", `${params.kpi.presenzaMedia}%`],
      ["RPE medio", params.kpi.rpeMedia > 0 ? String(params.kpi.rpeMedia) : "—", "Minutaggio medio", params.kpi.minutiMedi > 0 ? `${params.kpi.minutiMedi} min` : "—"],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3, halign: "left", valign: "middle" },
    columnStyles: {
      0: { fontStyle: "bold", textColor: gray, cellWidth: 55 },
      1: { cellWidth: 35 },
      2: { fontStyle: "bold", textColor: gray, cellWidth: 55 },
      3: { cellWidth: 35 },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (params.catData.length > 0) {
    y = secTitle("Dati per Categoria", y);
    autoTable(doc, {
      startY: y,
      head: [["Categoria", "File", "Presenza media", "RPE medio", "Minutaggio medio"]],
      body: params.catData.map(c => [
        c.cat, c.sessioni, `${c.presenzaMedia}%`,
        c.rpeMedia > 0 ? String(c.rpeMedia) : "—",
        c.minutiMedi > 0 ? `${c.minutiMedi} min` : "—",
      ]),
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 2.5, halign: "left", valign: "middle" },
      headStyles: { fillColor: red, textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (params.monthlyData.length > 0) {
    if (y > 200) { doc.addPage(); addHeader(); y = HDR + 12; }
    y = secTitle("Trend Mensile", y);
    autoTable(doc, {
      startY: y,
      head: [["Mese", "File", "Presenza media", "RPE medio"]],
      body: params.monthlyData.map(m => [
        m.label, m.sessioni, `${m.presenzaMedia}%`,
        m.rpeMedia > 0 ? String(m.rpeMedia) : "—",
      ]),
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2, halign: "left", valign: "middle" },
      headStyles: { fillColor: dark, textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" } },
      margin: { left: 14, right: 14 },
    });
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
    doc.text(`Pagina ${i} di ${totalPages}`, W - 14, H - 8, { align: "right" });
    doc.text(`Generato il ${new Date().toLocaleDateString("it-IT")}`, 14, H - 8);
  }

  doc.save(`USC_Epidemiologia_Carichi_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarraH({ label, value, max, color, extra }: {
  label: string; value: number; max: number; color: string; extra?: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-28 truncate shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-14 text-right shrink-0">{extra ?? value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EpidemiologiaPage() {
  const [records, setRecords] = useState<EpiMonthlyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [dettagli, setDettagli] = useState<DettaglioSituazionaleData[]>([]);

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCat, setUploadCat] = useState<Categoria>("U19");
  const [uploadAnno, setUploadAnno] = useState(new Date().getFullYear());
  const [uploadMese, setUploadMese] = useState(new Date().getMonth() + 1);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filtroCat, setFiltroCat] = useState("Tutte");
  const [filtroAnno, setFiltroAnno] = useState("Tutti");
  const [filtroMese, setFiltroMese] = useState("Tutti");

  const currentYear = new Date().getFullYear();
  const anni = Array.from({ length: 5 }, (_, i) => currentYear - i);

  useEffect(() => {
    loadEpiMonthly().then(r => { setRecords(r); setLoading(false); });
    loadAtleti().then(setAtleti);
    loadAllDettagliSituazionali().then(setDettagli);
  }, []);

  const filtered = useMemo(() => records.filter(r => {
    if (filtroCat !== "Tutte" && r.categoria !== filtroCat) return false;
    if (filtroAnno !== "Tutti" && r.anno !== parseInt(filtroAnno)) return false;
    if (filtroMese !== "Tutti" && r.mese !== parseInt(filtroMese)) return false;
    return true;
  }), [records, filtroCat, filtroAnno, filtroMese]);

  const allEntries = useMemo(() => filtered.flatMap(r => r.entries), [filtered]);

  const kpi = useMemo(() => {
    const sessioni = filtered.length;
    const totEntries = allEntries.length;
    const presenti = allEntries.filter(e => e.presente).length;
    const presenzaMedia = totEntries > 0 ? Math.round((presenti / totEntries) * 100) : 0;
    const withRpe = allEntries.filter(e => e.rpe != null && e.presente);
    const rpeMedia = withRpe.length > 0
      ? Math.round((withRpe.reduce((s, e) => s + e.rpe!, 0) / withRpe.length) * 10) / 10
      : 0;
    const withMin = allEntries.filter(e => e.minutaggio != null && e.presente);
    const minutiMedi = withMin.length > 0
      ? Math.round(withMin.reduce((s, e) => s + e.minutaggio!, 0) / withMin.length)
      : 0;
    return { sessioni, presenzaMedia, rpeMedia, minutiMedi };
  }, [filtered, allEntries]);

  const catData = useMemo(() => CATEGORIE.map(cat => {
    const catEntries = filtered.filter(r => r.categoria === cat).flatMap(r => r.entries);
    if (catEntries.length === 0) return null;
    const presenti = catEntries.filter(e => e.presente).length;
    const presenzaMedia = Math.round((presenti / catEntries.length) * 100);
    const withRpe = catEntries.filter(e => e.rpe != null && e.presente);
    const rpeMedia = withRpe.length > 0
      ? Math.round((withRpe.reduce((s, e) => s + e.rpe!, 0) / withRpe.length) * 10) / 10
      : 0;
    const withMin = catEntries.filter(e => e.minutaggio != null && e.presente);
    const minutiMedi = withMin.length > 0
      ? Math.round(withMin.reduce((s, e) => s + e.minutaggio!, 0) / withMin.length)
      : 0;
    return {
      cat,
      sessioni: filtered.filter(r => r.categoria === cat).length,
      presenzaMedia, rpeMedia, minutiMedi,
    };
  }).filter(Boolean) as { cat: string; sessioni: number; presenzaMedia: number; rpeMedia: number; minutiMedi: number }[],
  [filtered]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { entries: EpiMonthlyEntry[]; count: number }>();
    for (const r of filtered) {
      const key = `${r.anno}-${String(r.mese).padStart(2, "0")}`;
      const ex = map.get(key) ?? { entries: [], count: 0 };
      map.set(key, { entries: [...ex.entries, ...r.entries], count: ex.count + 1 });
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => {
      const [y, m] = key.split("-");
      const presenti = val.entries.filter(e => e.presente).length;
      const presenzaMedia = val.entries.length > 0 ? Math.round((presenti / val.entries.length) * 100) : 0;
      const withRpe = val.entries.filter(e => e.rpe != null && e.presente);
      const rpeMedia = withRpe.length > 0
        ? Math.round((withRpe.reduce((s, e) => s + e.rpe!, 0) / withRpe.length) * 10) / 10
        : 0;
      return { label: `${MESI[parseInt(m) - 1]} ${y}`, presenzaMedia, rpeMedia, sessioni: val.count };
    });
  }, [filtered]);

  // ── Infortuni statistics (from atleti + FIICCS) ────────────────────────────
  const infStats = useMemo(() => {
    function distrib(vals: (string | undefined | null)[]): [string, number][] {
      const map = new Map<string, number>();
      for (const v of vals) if (v) map.set(v, (map.get(v) ?? 0) + 1);
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }

    // All injuries: current active + archived
    const tuttiInfortuni = atleti.flatMap((a) => [
      ...((a.stato === "Infortunato" || a.stato === "NTL") && (a.infortunio || a.tipoInfortunio)
        ? [{ tipo: a.tipoInfortunio, meccanismo: a.meccanismo, lato: a.lato, contatto: a.contatto, evento: a.evento, categoria: a.categoria, osiics: a.osiicsCodice }]
        : []),
      ...(a.storicoInfortuni ?? []).map((inf) => ({
        tipo: inf.tipo, meccanismo: undefined as string | undefined,
        lato: undefined as string | undefined, contatto: undefined as string | undefined,
        evento: undefined as string | undefined, categoria: a.categoria,
        osiics: undefined as string | undefined,
      })),
    ]);

    const totaleInfortuni = tuttiInfortuni.length;
    const atletiInfortunatiOra = atleti.filter((a) => a.stato === "Infortunato" || a.stato === "NTL").length;

    const perTipo = distrib(tuttiInfortuni.map((i) => i.tipo));
    const perMeccanismo = distrib(tuttiInfortuni.map((i) => i.meccanismo));
    const perLato = distrib(tuttiInfortuni.map((i) => i.lato));
    const perCategoria = distrib(tuttiInfortuni.map((i) => i.categoria));

    // OSIICS-specific
    const codiciFull = atleti.filter((a) => a.osiicsCodice).map((a) => a.osiicsCodice!);
    const perOsiicsCodice = distrib(codiciFull);
    const OSIICS_CATEGORIE: Record<string, string> = {
      M: "Muscolo/Tendine",
      J: "Articolazione/Legamento",
      B: "Osso/Frattura",
      N: "Nervo/Midollo",
      S: "Cute/Lacerazioni",
      C: "Contusione",
      O: "Altro tessuto molle",
      X: "Testa/Concussione",
      I: "Malattia/Illness",
      W: "Sovraccarico",
    };
    const perOsiicsCategoria = distrib(codiciFull.map((c) => OSIICS_CATEGORIE[c[0]?.toUpperCase()] ?? `Altro (${c[0]?.toUpperCase() ?? "?"})`));

    // FIICCS — fonti combinate: tabella separata + JSONB su atleti (infortunio corrente e storico)
    type FiiccsLike = {
      tipoSeduta?: string; attivitaFisica?: string; modalitaInsorgenza?: string;
      terrenoGioco?: string; faseGioco?: string; minutoInfortunio?: number;
      azioneConPalla?: boolean; partitaSede?: string; tempoPartita?: string;
    };
    const fromForm = (f: import("@/lib/store").DettaglioSituazionaleForm | undefined | null): FiiccsLike | null => {
      if (!f) return null;
      const hasData = Object.values(f).some(v => v && (Array.isArray(v) ? v.length > 0 : v !== "" && v !== false));
      if (!hasData) return null;
      return {
        tipoSeduta: f.tipo_seduta || undefined,
        attivitaFisica: f.attivita_fisica || undefined,
        modalitaInsorgenza: f.modalita_insorgenza || undefined,
        terrenoGioco: f.terreno_gioco || undefined,
        faseGioco: f.fase_gioco || undefined,
        minutoInfortunio: f.minuto_infortunio ? Number(f.minuto_infortunio) : undefined,
        azioneConPalla: f.azione_con_palla === true ? true : f.azione_con_palla === false ? false : undefined,
        partitaSede: f.partita_sede || undefined,
        tempoPartita: f.tempo_partita || undefined,
      };
    };
    const tuttiDettagli: FiiccsLike[] = [
      ...dettagli,
      ...atleti.flatMap((a) => {
        const fonti: (FiiccsLike | null)[] = [fromForm(a.dettaglioSituazionale)];
        for (const inf of a.storicoInfortuni ?? []) {
          fonti.push(fromForm(inf.dettaglioSituazionale as import("@/lib/store").DettaglioSituazionaleForm | undefined));
        }
        return fonti.filter((f): f is FiiccsLike => f !== null);
      }),
    ];

    const perSeduta = distrib(tuttiDettagli.map((d) => d.tipoSeduta));
    const perAttivita = distrib(tuttiDettagli.map((d) => d.attivitaFisica));
    const perInsorgenza = distrib(tuttiDettagli.map((d) => d.modalitaInsorgenza));
    const perTerreno = distrib(tuttiDettagli.map((d) => d.terrenoGioco));
    const perFaseGioco = distrib(tuttiDettagli.map((d) => d.faseGioco));
    const minutiValori = tuttiDettagli.map((d) => d.minutoInfortunio).filter((v): v is number => v != null);
    const minutoMedio = minutiValori.length > 0 ? Math.round(minutiValori.reduce((a, b) => a + b, 0) / minutiValori.length) : null;
    const conPalla = tuttiDettagli.filter((d) => d.azioneConPalla === true).length;
    const senzaPalla = tuttiDettagli.filter((d) => d.azioneConPalla === false).length;

    // Contesto partita (solo schede con tipo_seduta = "Partita")
    const detPartita = tuttiDettagli.filter((d) => d.tipoSeduta === "Partita");
    const perSede = distrib(detPartita.map((d) => d.partitaSede));
    const perTempo = distrib(detPartita.map((d) => d.tempoPartita));

    return { totaleInfortuni, atletiInfortunatiOra, perTipo, perMeccanismo, perLato, perCategoria, perSeduta, perAttivita, perInsorgenza, perTerreno, perFaseGioco, minutoMedio, conPalla, senzaPalla, fiiccsCount: tuttiDettagli.length, perOsiicsCodice, perOsiicsCategoria, osiicsCount: codiciFull.length, perSede, perTempo, inPartitiCount: detPartita.length };
  }, [atleti, dettagli]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let entries: EpiMonthlyEntry[] = [];
      if (ext === "csv" || ext === "txt") {
        entries = parseCSV(await file.text());
      } else if (ext === "xlsx" || ext === "xls") {
        entries = await parseExcel(await file.arrayBuffer());
      } else if (ext === "pdf") {
        entries = await parsePDF(await file.arrayBuffer());
      } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
        alert("I file immagine (PNG/JPG) non supportano il parsing automatico. Carica il file in formato CSV o Excel.");
        return;
      } else {
        alert("Formato non supportato. Usa CSV, Excel, o PDF.");
        return;
      }
      if (entries.length === 0) {
        alert("Nessun dato valido trovato nel file. Assicurati che contenga almeno le colonne data e atleta.");
        return;
      }
      const id = `${uploadCat}-${uploadAnno}-${uploadMese}`;
      const record: EpiMonthlyRecord = {
        id, categoria: uploadCat, anno: uploadAnno, mese: uploadMese,
        uploadedAt: new Date().toISOString(), entries,
      };
      await upsertEpiMonthly(record);
      setRecords(await loadEpiMonthly());
      setShowUpload(false);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questo file mensile?")) return;
    await deleteEpiMonthly(id);
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const archiveRecords = useMemo(() =>
    [...records].sort((a, b) => b.anno !== a.anno ? b.anno - a.anno : b.mese - a.mese),
  [records]);

  if (loading) return <div className="p-6 text-gray-400">Caricamento...</div>;

  const vuoto = filtered.length === 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Epidemiologia</h1>
          <p className="text-gray-500 mt-1">Presenze, carichi di lavoro e RPE mensile per categoria</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-[#C8102E] text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-[#a80d26] transition-colors">
            <Upload className="w-3.5 h-3.5" /> Carica File
          </button>
          <button onClick={async () => { setPdfLoading(true); try { await esportaPDFEpi({ filtroCat, filtroAnno, filtroMese, kpi, catData, monthlyData }); } finally { setPdfLoading(false); } }}
            disabled={vuoto || pdfLoading}
            className="flex items-center gap-1.5 border border-red-300 text-red-700 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-red-50 disabled:opacity-40 transition-colors">
            <FileText className="w-3.5 h-3.5" /> {pdfLoading ? "..." : "PDF"}
          </button>
        </div>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Carica File</h2>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-1">
              Il sistema rileva automaticamente le colonne dalla prima riga del file. Sono supportati CSV, Excel e PDF.
            </p>
            <p className="text-[11px] text-gray-400 mb-4">
              Colonne riconosciute: data · atleta/nome · presente/assente · minutaggio/minuti · RPE — in qualsiasi ordine o lingua.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Categoria</label>
                <select value={uploadCat} onChange={e => setUploadCat(e.target.value as Categoria)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  {CATEGORIE.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Anno</label>
                  <select value={uploadAnno} onChange={e => setUploadAnno(parseInt(e.target.value))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                    {anni.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mese</label>
                  <select value={uploadMese} onChange={e => setUploadMese(parseInt(e.target.value))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                    {MESI_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">File</label>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.pdf,.png,.jpg,.jpeg" onChange={handleFileUpload}
                  className="mt-1 w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#C8102E] file:text-white hover:file:bg-[#a80d26] cursor-pointer" />
              </div>
              {uploading && <p className="text-xs text-gray-400 text-center animate-pulse">Elaborazione in corso...</p>}
            </div>
          </div>
        </div>
      )}

      {/* Archive */}
      {archiveRecords.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Archivio File Caricati</h2>
          <div className="space-y-2">
            {archiveRecords.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-white bg-[#C8102E] px-2 py-0.5 rounded-full">{r.categoria}</span>
                  <span className="text-sm font-medium text-gray-800">{MESI_FULL[r.mese - 1]} {r.anno}</span>
                  <span className="text-xs text-gray-400">
                    {r.entries.length} righe · {r.entries.filter(e => e.presente).length} presenti
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400">{new Date(r.uploadedAt).toLocaleDateString("it-IT")}</span>
                  <button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
          <option value="Tutte">Tutte le categorie</option>
          {CATEGORIE.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filtroAnno} onChange={e => setFiltroAnno(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
          <option value="Tutti">Tutti gli anni</option>
          {anni.map(a => <option key={a}>{a}</option>)}
        </select>
        <select value={filtroMese} onChange={e => setFiltroMese(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
          <option value="Tutti">Tutti i mesi</option>
          {MESI_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {vuoto ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium mb-1">Nessun dato disponibile</p>
          <p className="text-gray-400 text-sm mb-4">
            Carica un file mensile (CSV, Excel, PDF) per ogni categoria per visualizzare l&apos;analisi.
          </p>
          <button onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 bg-[#C8102E] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#a80d26] transition-colors">
            <Upload className="w-4 h-4" /> Carica il primo file
          </button>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <KPICard label="File caricati" value={kpi.sessioni} sub="mesi analizzati" color="bg-[#C8102E]" icon={Activity} />
            <KPICard label="Presenza media" value={`${kpi.presenzaMedia}%`} sub="atleti presenti" color="bg-gray-800" icon={Users} />
            <KPICard label="RPE medio" value={kpi.rpeMedia > 0 ? kpi.rpeMedia : "—"} sub="percezione fatica" color="bg-orange-500" icon={TrendingUp} />
            <KPICard label="Minutaggio medio" value={kpi.minutiMedi > 0 ? `${kpi.minutiMedi} min` : "—"} sub="per sessione" color="bg-blue-600" icon={Clock} />
          </div>

          {/* Per-category table */}
          {catData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Analisi per Categoria</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Categoria</th>
                      <th className="text-center py-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">File</th>
                      <th className="text-center py-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Presenza %</th>
                      <th className="text-center py-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">RPE medio</th>
                      <th className="text-center py-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Min. medi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catData.map(c => (
                      <tr key={c.cat} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 pr-4">
                          <span className="font-bold text-[#C8102E]">{c.cat}</span>
                        </td>
                        <td className="py-3 px-4 text-center text-gray-600">{c.sessioni}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${c.presenzaMedia}%`, backgroundColor: "#C8102E" }} />
                            </div>
                            <span className="text-gray-700 font-semibold text-xs w-8">{c.presenzaMedia}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {c.rpeMedia > 0
                            ? <span className={`font-semibold ${c.rpeMedia >= 8 ? "text-red-600" : c.rpeMedia >= 6 ? "text-orange-500" : "text-green-600"}`}>{c.rpeMedia}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center text-gray-600">
                          {c.minutiMedi > 0 ? `${c.minutiMedi} min` : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monthly trends */}
          {monthlyData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
              {/* Attendance trend */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Trend Presenza %</h2>
                <div className="flex items-end gap-1.5 h-28">
                  {monthlyData.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
                      {m.presenzaMedia > 0 && (
                        <span className="text-[9px] text-gray-500 font-semibold">{m.presenzaMedia}%</span>
                      )}
                      <div className="w-full rounded-t transition-all"
                        style={{
                          height: m.presenzaMedia > 0 ? `${Math.max((m.presenzaMedia / 100) * 100, 8)}%` : "4px",
                          backgroundColor: m.presenzaMedia > 0 ? "#C8102E" : "#F3F4F6",
                        }} />
                      <span className="text-[9px] text-gray-400 truncate w-full text-center">{m.label.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RPE trend */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Trend RPE Medio</h2>
                <div className="flex items-end gap-1.5 h-28">
                  {monthlyData.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
                      {m.rpeMedia > 0 && (
                        <span className="text-[9px] text-gray-500 font-semibold">{m.rpeMedia}</span>
                      )}
                      <div className="w-full rounded-t transition-all"
                        style={{
                          height: m.rpeMedia > 0 ? `${Math.max((m.rpeMedia / 10) * 100, 8)}%` : "4px",
                          backgroundColor: m.rpeMedia >= 8 ? "#C8102E" : m.rpeMedia >= 6 ? "#F97316" : m.rpeMedia > 0 ? "#22C55E" : "#F3F4F6",
                        }} />
                      <span className="text-[9px] text-gray-400 truncate w-full text-center">{m.label.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-3">
                  {[["< 6  Basso", "#22C55E"], ["6–7  Medio", "#F97316"], ["≥ 8  Elevato", "#C8102E"]].map(([l, c]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: c }} />
                      <span className="text-[9px] text-gray-500">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Categoria attendance bars */}
          {catData.length > 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Presenza per Categoria</h2>
              <div className="space-y-3">
                {[...catData].sort((a, b) => b.presenzaMedia - a.presenzaMedia).map(c => (
                  <BarraH key={c.cat} label={c.cat} value={c.presenzaMedia} max={100} color="#C8102E" extra={`${c.presenzaMedia}%`} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Statistiche Infortuni ─────────────────────────────────────────── */}
      {(infStats.totaleInfortuni > 0 || infStats.fiiccsCount > 0) && (
        <div className="mt-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#C8102E] rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Statistiche Infortuni</h2>
              <p className="text-xs text-gray-400">
                {infStats.totaleInfortuni} infortuni registrati · {infStats.atletiInfortunatiOra} attualmente in rehab
                {infStats.osiicsCount > 0 && ` · ${infStats.osiicsCount} codici OSIICS`}
                {infStats.fiiccsCount > 0 && ` · ${infStats.fiiccsCount} schede FIICCS`}
              </p>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-2xl font-bold text-[#C8102E]">{infStats.totaleInfortuni}</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">Infortuni totali</p>
              <p className="text-xs text-gray-400 mt-0.5">attivi + archiviati</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-2xl font-bold text-orange-500">{infStats.atletiInfortunatiOra}</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">In rehab ora</p>
              <p className="text-xs text-gray-400 mt-0.5">atleti attivi</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-2xl font-bold text-blue-600">{infStats.osiicsCount}</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">Codici OSIICS</p>
              <p className="text-xs text-gray-400 mt-0.5">classificati</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-2xl font-bold text-gray-700">{infStats.minutoMedio != null ? `${infStats.minutoMedio}'` : "—"}</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">Minuto medio</p>
              <p className="text-xs text-gray-400 mt-0.5">infortunio in partita</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            {/* Tipo infortunio */}
            {infStats.perTipo.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Tipo Infortunio</h3>
                <div className="space-y-3">
                  {infStats.perTipo.map(([label, n]) => (
                    <BarraH key={label} label={label} value={n} max={infStats.perTipo[0][1]} color="#C8102E" extra={`${n}`} />
                  ))}
                </div>
              </div>
            )}

            {/* Meccanismo */}
            {infStats.perMeccanismo.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Meccanismo</h3>
                <div className="space-y-3">
                  {infStats.perMeccanismo.map(([label, n]) => (
                    <BarraH key={label} label={label} value={n} max={infStats.perMeccanismo[0][1]} color="#374151" extra={`${n}`} />
                  ))}
                </div>
              </div>
            )}

            {/* OSIICS per categoria */}
            {infStats.perOsiicsCategoria.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-blue-600 uppercase tracking-widest">OSIICS — Categoria</h3>
                  <span className="text-[10px] bg-blue-100 text-blue-600 font-mono px-1.5 py-0.5 rounded">v13</span>
                </div>
                <div className="space-y-3">
                  {infStats.perOsiicsCategoria.map(([label, n]) => (
                    <BarraH key={label} label={label} value={n} max={infStats.perOsiicsCategoria[0][1]} color="#1D4ED8" extra={`${n}`} />
                  ))}
                </div>
              </div>
            )}

            {/* OSIICS codici specifici */}
            {infStats.perOsiicsCodice.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-blue-600 uppercase tracking-widest">OSIICS — Codici</h3>
                  <span className="text-[10px] text-blue-400">{infStats.osiicsCount} totali</span>
                </div>
                <div className="space-y-2">
                  {infStats.perOsiicsCodice.map(([code, n]) => {
                    const atleta = atleti.find((a) => a.osiicsCodice === code);
                    const desc = atleta?.osiicsDescrizione;
                    return (
                      <div key={code} className="flex items-center gap-3">
                        <span className="font-mono font-bold text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded w-16 text-center shrink-0">{code}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max((n / infStats.perOsiicsCodice[0][1]) * 100, n > 0 ? 4 : 0)}%`, backgroundColor: "#1D4ED8" }} />
                        </div>
                        <span className="text-xs text-gray-500 truncate max-w-[120px]">{desc ?? ""}</span>
                        <span className="text-xs font-bold text-gray-700 w-6 text-right shrink-0">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tipo seduta (FIICCS) */}
            {infStats.perSeduta.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Tipo Seduta (FIICCS)</h3>
                <div className="space-y-3">
                  {infStats.perSeduta.map(([label, n]) => (
                    <BarraH key={label} label={label} value={n} max={infStats.perSeduta[0][1]} color="#1D4ED8" extra={`${n}`} />
                  ))}
                </div>
                {(infStats.conPalla > 0 || infStats.senzaPalla > 0) && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span className="text-xs text-gray-600">Con palla: <strong>{infStats.conPalla}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                      <span className="text-xs text-gray-600">Senza palla: <strong>{infStats.senzaPalla}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contesto Partita (FIICCS) */}
            {infStats.inPartitiCount > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Contesto Partita (FIICCS)</h3>
                <p className="text-xs text-gray-400 mb-4">{infStats.inPartitiCount} infortuni in partita</p>

                {/* Casa / Trasferta */}
                {infStats.perSede.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sede</p>
                    <div className="space-y-2 mb-4">
                      {infStats.perSede.map(([label, n]) => (
                        <BarraH key={label} label={label} value={n} max={infStats.perSede[0][1]}
                          color={label === "Casa" ? "#059669" : "#C8102E"} extra={`${n}`} />
                      ))}
                    </div>
                  </>
                )}

                {/* Terreno */}
                {infStats.perTerreno.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Terreno di gioco</p>
                    <div className="space-y-2 mb-4">
                      {infStats.perTerreno.map(([label, n]) => (
                        <BarraH key={label} label={label} value={n} max={infStats.perTerreno[0][1]} color="#7C3AED" extra={`${n}`} />
                      ))}
                    </div>
                  </>
                )}

                {/* Primo / Secondo tempo */}
                {infStats.perTempo.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tempo della partita</p>
                    <div className="space-y-2">
                      {infStats.perTempo.map(([label, n]) => (
                        <BarraH key={label} label={label} value={n} max={infStats.perTempo[0][1]}
                          color={label === "Primo tempo" ? "#2563EB" : label === "Secondo tempo" ? "#D97706" : "#6B7280"} extra={`${n}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Attività fisica (FIICCS) */}
            {infStats.perAttivita.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Attività Fisica (FIICCS)</h3>
                <div className="space-y-3">
                  {infStats.perAttivita.map(([label, n]) => (
                    <BarraH key={label} label={label} value={n} max={infStats.perAttivita[0][1]} color="#D97706" extra={`${n}`} />
                  ))}
                </div>
              </div>
            )}

            {/* Modalità insorgenza (FIICCS) */}
            {infStats.perInsorgenza.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Modalità Insorgenza (FIICCS)</h3>
                <div className="space-y-3">
                  {infStats.perInsorgenza.map(([label, n]) => (
                    <BarraH key={label} label={label} value={n} max={infStats.perInsorgenza[0][1]} color="#7C3AED" extra={`${n}`} />
                  ))}
                </div>
              </div>
            )}


            {/* Fase di gioco (FIICCS) */}
            {infStats.perFaseGioco.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Fase di Gioco (FIICCS)</h3>
                <div className="space-y-3">
                  {infStats.perFaseGioco.map(([label, n]) => (
                    <BarraH key={label} label={label} value={n} max={infStats.perFaseGioco[0][1]} color="#DC2626" extra={`${n}`} />
                  ))}
                </div>
              </div>
            )}

            {/* Lato / Categoria */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Distribuzione</h3>
              {infStats.perLato.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Lato</p>
                  <div className="space-y-2 mb-4">
                    {infStats.perLato.map(([label, n]) => (
                      <BarraH key={label} label={label} value={n} max={infStats.perLato[0][1]} color="#F59E0B" extra={`${n}`} />
                    ))}
                  </div>
                </>
              )}
              {infStats.perCategoria.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Per Categoria</p>
                  <div className="space-y-2">
                    {infStats.perCategoria.map(([label, n]) => (
                      <BarraH key={label} label={label} value={n} max={infStats.perCategoria[0][1]} color="#C8102E" extra={`${n}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
