"use client";

import { useEffect, useState } from "react";
import { Plus, Search, User, ChevronRight, Phone, Mail, Trash2, AlertTriangle, CheckCircle2, Clock, Pencil, RotateCcw, FileDown, X, ExternalLink, Copy, Check } from "lucide-react";
import {
  loadAtleti, loadProgrammi, upsertAtleta, deleteAtleta, uid, nd,
  subscribeToAtleti, subscribeToProgrammi, subscribeToIntakeInsert,
  CATEGORIE, TIPI_INFORTUNIO, calcolaProgressoAuto,
  loadDettaglioSituazionale, upsertDettaglioSituazionale, formToDettaglio,
  type Atleta, type Stato, type InfortunioStorico, type Programma, type QuestionarioKinesiofobia,
  type TestFisiometrico,
  type DettaglioSituazionaleData, type DettaglioSituazionaleForm,
} from "@/lib/store";
import AtletaModal from "@/components/AtletaModal";
import { esportaPDFAtleta } from "@/lib/pdf-atleta";

const MAPPING_KEY = "perf_athlete_mapping";
function getPerfId(rehabId: string): string | null {
  try { return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? "{}")[rehabId] ?? null; } catch { return null; }
}

async function syncInjury(atleta: Atleta) {
  const perfId = getPerfId(atleta.id);
  const statoMap: Record<string, string> = { Infortunato: "rehab", Disponibile: "disponibile" };
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


const statoColor: Record<Stato, string> = {
  "Infortunato": "bg-orange-100 text-orange-700",
  "Disponibile": "bg-green-100 text-green-700",
};

const FILTRI_STATO: { label: string; value: Stato | "Tutti" }[] = [
  { label: "Tutti", value: "Tutti" },
  { label: "Infortunato", value: "Infortunato" },
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

  useEffect(() => {
    loadAtleti().then(setAtleti);
    const unsubAtleti = subscribeToAtleti(() => loadAtleti().then(setAtleti));
    const unsubIntake = subscribeToIntakeInsert(() => loadAtleti().then(setAtleti));
    return () => { unsubAtleti(); unsubIntake(); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const updated = atleti.find((a) => a.id === selected.id);
    if (updated && updated !== selected) setSelected(updated);
  }, [atleti]);

  useEffect(() => {
    if (!selected || selected.stato !== "Infortunato") { setDettaglioSituazionale(null); return; }
    loadDettaglioSituazionale(selected.id).then(setDettaglioSituazionale);
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
  const apriModifica = (a: Atleta) => { setEditAtleta(a); setMostraForm(true); };

  const apriNuovoInfortunio = (a: Atleta) => {
    const template: Atleta = {
      ...a,
      stato: "Infortunato",
      infortunio: "",
      tipoInfortunio: undefined,
      inizioRehab: "",
      fineRehab: undefined,
      progresso: 0,
    };
    setEditAtleta(template);
    setMostraForm(true);
  };

  const onSalvaAtleta = async (dati: Omit<Atleta, "id">, atletaId: string, dettaglio?: DettaglioSituazionaleForm) => {
    try {
      if (editAtleta) {
        let aggiornato: Atleta = { ...dati, id: editAtleta.id };
        // Se l'atleta passa da Infortunato a Disponibile, archivia l'infortunio corrente
        if (editAtleta.stato === "Infortunato" && dati.stato === "Disponibile") {
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
            aggiornato = {
              ...aggiornato,
              storicoInfortuni: [...(editAtleta.storicoInfortuni ?? []), inf],
              infortunio: "",
              tipoInfortunio: undefined,
              inizioRehab: "",
              fineRehab: undefined,
              progresso: 100,
            };
          }
        }
        setAtleti((prev) => prev.map((a) => a.id === editAtleta.id ? aggiornato : a));
        setSelected(aggiornato);
        await upsertAtleta(aggiornato);
        syncInjury(aggiornato);
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

  const scaricaPDFStorico = async () => {
    if (!selected) return;
    const programmi = await loadProgrammi(selected.id);
    await esportaPDFAtleta(selected, programmi);
  };

  const salvaQuestionnaire = async (questionari: QuestionarioKinesiofobia[]) => {
    if (!selected) return;
    const aggiornato = { ...selected, questionariKinesiofobia: questionari };
    setAtleti((prev) => prev.map((a) => a.id === selected.id ? aggiornato : a));
    setSelected(aggiornato);
    await upsertAtleta(aggiornato);
  };

  const elimina = async (id: string) => {
    setAtleti((prev) => prev.filter((a) => a.id !== id));
    if (selected?.id === id) setSelected(null);
    await deleteAtleta(id);
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
      const statoOrd = (s: string) => s === "Infortunato" ? 0 : 1;
      const sd = statoOrd(a.stato) - statoOrd(b.stato);
      if (sd !== 0) return sd;
      return nd(a).localeCompare(nd(b), "it");
    });
    if (lista.length > 0) perCategoria[cat] = lista;
  });

  const countPerStato = (s: Stato | "Tutti") =>
    s === "Tutti" ? atleti.length : atleti.filter((a) => a.stato === s).length;

  return (
    <div className="flex h-full">
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
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{lista.length}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="space-y-3">
                  {lista.map((atleta) => (
                    <div key={atleta.id} className="group flex items-center gap-2">
                    <button onClick={() => { setSelected(atleta); setTab("dati"); }}
                      className={`flex-1 min-w-0 bg-white rounded-xl p-4 border text-left transition-all hover:shadow-md ${
                        selected?.id === atleta.id ? "border-[#C8102E] shadow-md" : "border-gray-100"
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                          atleta.stato === "Disponibile" ? "bg-gray-300" : "bg-[#2B2B2B]"
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
                          {atleta.infortunio && (
                            <p className="text-xs text-gray-500 truncate font-medium">{atleta.infortunio}</p>
                          )}
                          <p className="text-xs text-gray-300 truncate mt-0.5">
                            {[atleta.posizione, atleta.tipoInfortunio].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center">
                          <ChevronRight className="w-4 h-4 text-gray-200" />
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Eliminare ${nd(atleta)}?`)) elimina(atleta.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500"
                      title="Elimina atleta">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
                  ))}
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
                selected.stato === "Disponibile" ? "bg-gray-400" : "bg-[#2B2B2B]"
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
                {selected.stato === "Infortunato" && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Dettaglio situazionale</p>
                    {dettaglioSituazionale ? (
                      <div className="space-y-2">
                        {[
                          dettaglioSituazionale.fonteInformazione?.length && ["Fonte", dettaglioSituazionale.fonteInformazione.join(", ")],
                          dettaglioSituazionale.giorniReferto != null && ["Giorni a referto", String(dettaglioSituazionale.giorniReferto)],
                          dettaglioSituazionale.modalitaInsorgenza && ["Insorgenza", dettaglioSituazionale.modalitaInsorgenza + (dettaglioSituazionale.modalitaInsorgenzaAltro ? ` — ${dettaglioSituazionale.modalitaInsorgenzaAltro}` : "")],
                          dettaglioSituazionale.attivitaFisica && ["Attività fisica", dettaglioSituazionale.attivitaFisica],
                          dettaglioSituazionale.tipoCorsa && ["Tipo corsa", dettaglioSituazionale.tipoCorsa],
                          dettaglioSituazionale.corsaGradi && ["Gradi cambio dir.", dettaglioSituazionale.corsaGradi],
                          dettaglioSituazionale.saltoFase && ["Fase salto", dettaglioSituazionale.saltoFase],
                          dettaglioSituazionale.contattoDettaglio && ["Tipo contatto", dettaglioSituazionale.contattoDettaglio],
                          dettaglioSituazionale.direzioneContrasto && ["Direzione contrasto", dettaglioSituazionale.direzioneContrasto],
                          dettaglioSituazionale.attivitaConPalla && ["Azione con palla", dettaglioSituazionale.attivitaConPalla],
                          dettaglioSituazionale.calcioTipo && ["Tipo calcio", dettaglioSituazionale.calcioTipo],
                          dettaglioSituazionale.tipoSeduta && ["Tipo seduta", dettaglioSituazionale.tipoSeduta + (dettaglioSituazionale.tipoEsercitazione ? ` — ${dettaglioSituazionale.tipoEsercitazione}` : "")],
                          dettaglioSituazionale.partitaCompetizione && ["Competizione", dettaglioSituazionale.partitaCompetizione],
                          dettaglioSituazionale.faseGioco && ["Fase di gioco", dettaglioSituazionale.faseGioco],
                          dettaglioSituazionale.minutoInfortunio != null && ["Minuto", `${dettaglioSituazionale.minutoInfortunio}'`],
                          dettaglioSituazionale.terrenoGioco && ["Terreno", dettaglioSituazionale.terrenoGioco],
                        ].filter((item): item is [string, string] => Array.isArray(item)).map(([label, value]) => (
                          <div key={label as string} className="bg-blue-50 rounded-xl p-3">
                            <p className="text-xs text-blue-400">{label as string}</p>
                            <p className="font-medium text-blue-900 text-sm">{value as string}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic py-2">Nessun dettaglio situazionale inserito</p>
                    )}
                  </div>
                )}


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

                {selected.note && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Note</p>
                    <p className="text-gray-700">{selected.note}</p>
                  </div>
                )}

                {(selected.peso || selected.altezza) && (
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
                    </div>
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
                    ...(selected.stato === "Infortunato" && (selected.infortunio || selected.inizioRehab) ? [{
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

                      {/* Punteggi registrati */}
                      <div className="pt-1">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Punteggi RTS registrati</p>
                          <button onClick={() => setMostraPunteggioRTS((v) => !v)}
                            className="text-xs font-semibold text-[#C8102E] flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Aggiungi
                          </button>
                        </div>

                        {mostraPunteggioRTS && (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-2">
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
                                <input type="number" min={0} max={100} placeholder="0–100"
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

                        {(selected.questionariKinesiofobia ?? []).length === 0 ? (
                          <p className="text-xs text-gray-400 italic">Nessun punteggio registrato</p>
                        ) : (
                          <div className="space-y-1.5">
                            {[...(selected.questionariKinesiofobia ?? [])].sort((a, b) => b.data.localeCompare(a.data)).map((q) => {
                              const colore = q.punteggio >= 75 ? "text-green-600" : q.punteggio >= 56 ? "text-orange-500" : "text-red-600";
                              const inf = infortuniOpts.find((o) => o.id === q.infortunioId);
                              return (
                                <div key={q.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-3 py-2">
                                  <div>
                                    {q.tipoTest && <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-2">{q.tipoTest}</span>}
                                    <span className={`text-sm font-bold ${colore}`}>{q.punteggio}/{q.tipoTest === "TSK" ? 40 : 100}</span>
                                    <span className="text-xs text-gray-400 ml-2">{new Date(q.data + "T12:00").toLocaleDateString("it-IT")}</span>
                                    {inf && <p className="text-[11px] text-gray-400 mt-0.5">{inf.label}</p>}
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
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* ── Storico infortuni ── */
              (() => {
                const storico = selected.storicoInfortuni ?? [];
                const isSessione = (p: Programma) => !p.riposo;
                const matchInf = (p: Programma, inf: InfortunioStorico) => {
                  const eid = p.infortunioId === "__corrente__" ? undefined : p.infortunioId;
                  if (eid) return eid === inf.id;
                  if (!p.data || !inf.inizioRehab) return false;
                  if (p.data < inf.inizioRehab) return false;
                  if (inf.fineRehab && p.data > inf.fineRehab) return false;
                  return true;
                };
                const giorni = storico.map((inf) => programmiAtleta.filter((p) => matchInf(p, inf) && isSessione(p)).length);
                const giorniCorrente = selected.stato === "Infortunato" && selected.inizioRehab
                  ? programmiAtleta.filter((p) => (
                      p.infortunioId === "__corrente__" ||
                      (!p.infortunioId && p.data >= selected.inizioRehab)
                    ) && isSessione(p)).length
                  : 0;
                const totaleStagione = giorni.reduce((s, g) => s + g, 0) + giorniCorrente;

                const fmtData = (d: string) =>
                  d ? new Date(d + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

                return (
                  <div className="space-y-4 text-sm">
                    {/* Stat tiles */}
                    <div className={`grid gap-3 ${selected.stato === "Infortunato" ? "grid-cols-2" : "grid-cols-1"}`}>
                      {selected.stato === "Infortunato" && (
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 text-center">
                          <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-widest mb-1">Infortunio attuale</p>
                          <p className="text-3xl font-bold text-orange-600 leading-none">{giorniCorrente}</p>
                          <p className="text-[11px] text-orange-400 mt-1">sessioni</p>
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

                    {/* Infortunio corrente */}
                    {selected.stato === "Infortunato" && (selected.infortunio || selected.inizioRehab) && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">In corso</p>
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
                      </div>
                    )}

                    {/* Storico archiviato */}
                    {storico.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Infortuni precedenti</p>
                        <div className="space-y-2">
                          {[...storico].reverse().map((inf, i) => {
                            const realIdx = storico.length - 1 - i;
                            const isEditing = editStorico?.idx === realIdx;
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
                                          {giorni[realIdx]} sess.
                                        </span>
                                        <button onClick={() => { setEditStorico({ inf, idx: realIdx }); setEditStoricoForm({ ...inf }); }}
                                          className="p-1 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600" title="Modifica">
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => ripristinaInfortunio(inf, realIdx)}
                                          className="p-1 rounded-lg hover:bg-orange-50 text-gray-300 hover:text-orange-500" title="Ripristina come attivo">
                                          <RotateCcw className="w-3 h-3" />
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

                    {storico.length === 0 && selected.stato === "Disponibile" && (
                      <div className="text-center py-10">
                        <Clock className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">Nessun infortunio in archivio</p>
                      </div>
                    )}

                    {storico.length === 0 && selected.stato === "Infortunato" && !selected.infortunio && !selected.inizioRehab && (
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
