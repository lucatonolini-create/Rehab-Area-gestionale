"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Activity, TrendingUp, Dumbbell, ChevronRight, X } from "lucide-react";
import {
  loadAtleti, loadProgrammi, upsertAtleta, nd,
  subscribeToAtleti, subscribeToProgrammi,
  CATEGORIE, type Atleta, type Programma, type Stato,
} from "@/lib/store";
import Link from "next/link";
import AtletaModal from "@/components/AtletaModal";

const statoColor: Record<Stato, string> = {
  "Infortunato": "bg-orange-100 text-orange-700",
  "Disponibile": "bg-green-100 text-green-700",
};

export default function Dashboard() {
  const router = useRouter();
  const [atleti, setAtleti] = useState<Atleta[]>([]);
  const [programmi, setProgrammi] = useState<Programma[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("Tutti");
  const [atletaSelezionato, setAtletaSelezionato] = useState<Atleta | null>(null);
  const [mostraModifica, setMostraModifica] = useState(false);

  useEffect(() => {
    const reload = async () => {
      const atletiData = await loadAtleti();
      setAtleti(atletiData);
      if (atletiData.length > 0) {
        const all = (await Promise.all(atletiData.map((a) => loadProgrammi(a.id)))).flat();
        setProgrammi(all);
      } else {
        setProgrammi([]);
      }
    };
    reload();
    const unsubAtleti = subscribeToAtleti(reload);
    const unsubProgrammi = subscribeToProgrammi(reload);
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    const onOnline = () => reload();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      unsubAtleti();
      unsubProgrammi();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const aggiornaDopo = () => {
    loadAtleti().then(setAtleti);
    setAtletaSelezionato(null);
    setMostraModifica(false);
  };

  const inRecupero = atleti.filter((a) => a.stato === "Infortunato").length;
  const guariti    = atleti.filter((a) => a.stato === "Disponibile").length;

  const atletiFiltrati = (filtroCategoria === "Tutti"
    ? atleti
    : atleti.filter((a) => a.categoria === filtroCategoria)
  ).slice().sort((a, b) => {
    const statoOrd = (s: string) => s === "Infortunato" ? 0 : 1;
    const sd = statoOrd(a.stato) - statoOrd(b.stato);
    if (sd !== 0) return sd;
    return nd(a).localeCompare(nd(b), "it");
  });

  const infortunatiIds = new Set(atleti.filter((a) => a.stato === "Infortunato").map((a) => a.id));
  const programmiReali = programmi.filter((p) => !p.riposo);
  const programmiAttivi = programmiReali.filter((p) => infortunatiIds.has(p.atletaId)).length;

  const stats = [
    { label: "Atleti Totali",     value: atleti.length,         icon: Users,      color: "bg-[#2B2B2B]", href: "/atleti" },
    { label: "Infortunati",        value: inRecupero,            icon: Activity,   color: "bg-orange-500", href: "/atleti" },
    { label: "Disponibili",       value: guariti,                icon: TrendingUp, color: "bg-green-500",  href: "/atleti" },
    { label: "Programmi Attivi",  value: programmiAttivi,       icon: Dumbbell,   color: "bg-[#C8102E]",  href: "/esercizi" },
    { label: "Programmi Totali",  value: programmiReali.length, icon: Dumbbell,   color: "bg-[#2B2B2B]",  href: "/esercizi" },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Stat cards cliccabili */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-[#C8102E]/30 transition-all group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-2.5 rounded-xl group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Filtro per categoria */}
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Filtra per categoria</h2>
        <div className="flex flex-wrap gap-2">
          {["Tutti", ...CATEGORIE].map((cat) => {
            const count = cat === "Tutti" ? atleti.length : atleti.filter((a) => a.categoria === cat).length;
            if (count === 0 && cat !== "Tutti") return null;
            return (
              <button key={cat} onClick={() => setFiltroCategoria(cat)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  filtroCategoria === cat
                    ? "bg-[#C8102E] text-white shadow-sm"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
                }`}>
                {cat}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  filtroCategoria === cat ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista atleti */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {filtroCategoria === "Tutti" ? "Tutti gli atleti" : `Categoria ${filtroCategoria}`}
            <span className="ml-2 text-xs text-gray-400 font-normal">{atletiFiltrati.length} atleti</span>
          </h2>
          <Link href="/atleti" className="text-xs text-[#C8102E] font-medium hover:underline flex items-center gap-1">
            Gestisci <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {atletiFiltrati.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">
              {atleti.length === 0
                ? "Nessun atleta ancora. Vai su Atleti per aggiungerne uno."
                : "Nessun atleta in questa categoria."}
            </p>
            {atleti.length === 0 && (
              <Link href="/atleti" className="text-[#C8102E] text-sm font-medium mt-2 inline-block hover:underline">
                + Aggiungi atleta
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {atletiFiltrati.map((atleta) => (
              <button key={atleta.id} onClick={() => setAtletaSelezionato(atleta)}
                className="w-full px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                    atleta.stato === "Disponibile" ? "bg-gray-300" : "bg-[#2B2B2B]"
                  }`}>
                    {nd(atleta).trim().split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>(w[0]??"").toUpperCase()).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm font-semibold truncate ${atleta.stato === "Disponibile" ? "text-gray-500" : "text-gray-900"}`}>{nd(atleta)}</p>
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
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <ChevronRight className="w-4 h-4 text-gray-200" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mini pannello atleta */}
      {atletaSelezionato && !mostraModifica && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 bg-white shadow-2xl border-l border-gray-100 flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Scheda atleta</h3>
            <button onClick={() => setAtletaSelezionato(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-[#2B2B2B] rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-2">
                {nd(atletaSelezionato).trim().split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>(w[0]??"").toUpperCase()).join("")}
              </div>
              <h2 className="font-bold text-gray-900 text-lg">{nd(atletaSelezionato)}</h2>
              <p className="text-sm text-gray-500">{atletaSelezionato.categoria} · {atletaSelezionato.posizione || "—"}</p>
              <span className={`text-xs px-3 py-1 rounded-full font-medium mt-1 inline-block ${statoColor[atletaSelezionato.stato]}`}>
                {atletaSelezionato.stato}
              </span>
            </div>

            <div className="space-y-2.5 text-sm">
              {[
                ["Piede dominante", atletaSelezionato.piedeDominante || "—"],
                ["Infortunio", atletaSelezionato.infortunio || "—"],
                ["Inizio riabilitazione", atletaSelezionato.inizioRehab ? new Date(atletaSelezionato.inizioRehab + "T12:00").toLocaleDateString("it-IT") : "—"],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-medium text-gray-900">{value}</p>
                </div>
              ))}

              {atletaSelezionato.note && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Note</p>
                  <p className="text-gray-700">{atletaSelezionato.note}</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-5 border-t border-gray-100 space-y-2">
            <button onClick={() => setMostraModifica(true)}
              className="w-full bg-[#C8102E] text-white py-3 rounded-xl text-sm font-medium hover:bg-red-800">
              Modifica dati
            </button>
            <Link href="/atleti"
              className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2">
              Vai alla scheda completa
            </Link>
          </div>
        </div>
      )}

      {/* Overlay */}
      {atletaSelezionato && (
        <div className="fixed inset-0 bg-black/20 z-30" onClick={() => { setAtletaSelezionato(null); setMostraModifica(false); }} />
      )}

      {/* Modal modifica */}
      {mostraModifica && atletaSelezionato && (
        <AtletaModal
          atletaIniziale={atletaSelezionato}
          onSalva={async (dati) => {
            await upsertAtleta({ ...dati, id: atletaSelezionato.id });
            aggiornaDopo();
          }}
          onChiudi={() => setMostraModifica(false)}
        />
      )}
    </div>
  );
}
