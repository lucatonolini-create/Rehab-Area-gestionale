"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useForm } from "react-hook-form";
import { ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import type { DettaglioSituazionaleForm } from "@/lib/store";

export type { DettaglioSituazionaleForm };

export interface DettaglioSituazionaleHandle {
  getValues: () => DettaglioSituazionaleForm;
  hasData: () => boolean;
  reset: () => void;
}

interface Props {
  contatto?: string;
  initialValues?: Partial<DettaglioSituazionaleForm>;
}

const DEFAULT_VALUES: DettaglioSituazionaleForm = {
  fonte_informazione: [],
  fonte_informazione_altro: "",
  giorni_referto: "",
  modalita_insorgenza: "",
  modalita_insorgenza_altro: "",
  contatto_dettaglio: "",
  situazione_duello: "",
  direzione_contrasto: "",
  collisione_con: "",
  duello_aereo: "",
  attivita_fisica: "",
  tipo_corsa: "",
  corsa_gradi: "",
  corsa_gamba_coinvolta: "",
  salto_fase: "",
  salto_atterraggio_dove: "",
  salto_gamba_atterraggio: "",
  caduta_dettagli: "",
  azione_con_palla: false,
  situazione_gioco_palla: "",
  attivita_con_palla: "",
  calcio_azione: "",
  calcio_intensita: "",
  calcio_tipo: "",
  calcio_fase: "",
  dribbling_tipo: "",
  palla_altezza: "",
  controllo_palla_con: "",
  gamba_infortunata_palla: "",
  tipo_seduta: "",
  tipo_esercitazione: "",
  partita_sede: "",
  partita_competizione: "",
  partita_punteggio: "",
  fase_gioco: "",
  sotto_fase_gioco: "",
  terreno_gioco: "",
  decisione_arbitrale: "",
  minuto_infortunio: "",
  minuti_giocati_prima: "",
};

const cls = {
  sel: "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white",
  inp: "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]",
  sec: "text-xs font-bold text-gray-400 uppercase tracking-widest mb-3",
  lbl: "text-xs font-semibold text-gray-500 uppercase tracking-wide",
};

const Sel = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { children?: React.ReactNode }>(
  (props, ref) => (
    <select ref={ref} {...props} className={`${cls.sel} ${props.className ?? ""}`} />
  )
);

const DettaglioSituazionale = forwardRef<DettaglioSituazionaleHandle, Props>(
  ({ contatto, initialValues }, ref) => {
    const [aperto, setAperto] = useState(true);
    const { register, watch, getValues, reset } = useForm<DettaglioSituazionaleForm>({
      defaultValues: initialValues ? { ...DEFAULT_VALUES, ...initialValues } : DEFAULT_VALUES,
    });

    // Campi watched per la logica condizionale a cascata
    const attivitaFisica = watch("attivita_fisica");
    const tipoCorsa = watch("tipo_corsa");
    const saltoFase = watch("salto_fase");
    const azioneConPalla = watch("azione_con_palla");
    const attivitaConPalla = watch("attivita_con_palla");
    const tipoSeduta = watch("tipo_seduta");
    const tipoEsercitazione = watch("tipo_esercitazione");
    const modalitaInsorgenza = watch("modalita_insorgenza");
    const fonteSel = watch("fonte_informazione");

    useImperativeHandle(ref, () => ({
      getValues,
      hasData: () => {
        const v = getValues();
        return !!(
          v.fonte_informazione?.length ||
          v.giorni_referto ||
          v.modalita_insorgenza ||
          v.attivita_fisica ||
          v.tipo_seduta ||
          v.azione_con_palla
        );
      },
      reset: () => reset(DEFAULT_VALUES),
    }));

    // Visibilità sezione B
    const mostraSezioneB = !!contatto && contatto !== "Non contatto";
    // Visibilità sezione F
    const mostraSezioneF =
      tipoSeduta === "Partita" ||
      tipoEsercitazione === "Tattica" ||
      tipoEsercitazione === "Partitella (SSG)";

    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setAperto((p) => !p)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">
              Dettaglio situazionale
            </span>
            <span className="text-xs text-gray-400 italic">(modello FIICCS)</span>
          </div>
          {aperto ? (
            <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </button>

        <div className={`border-t border-gray-100 px-5 pb-5 space-y-6${aperto ? "" : " hidden"}`}>

            {/* ── A. Raccolta dati ────────────────────────────────────── */}
            <div className="pt-4 space-y-4">
              <p className={cls.sec}>A — Raccolta dati</p>

              {/* Fonte informazione (multi-select checkboxes) */}
              <div>
                <label className={cls.lbl}>Fonte informazione</label>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {[
                    "Riferito dal giocatore infortunato",
                    "Riferito dallo staff medico presente",
                    "Riferito dallo staff medico diagnosticante",
                    "Video-analisi",
                    "Altro",
                  ].map((fonte) => (
                    <label key={fonte} className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700">
                      <input
                        type="checkbox"
                        value={fonte}
                        {...register("fonte_informazione")}
                        className="w-4 h-4 accent-[#C8102E] shrink-0"
                      />
                      {fonte}
                    </label>
                  ))}
                </div>
                {fonteSel?.includes("Altro") && (
                  <input
                    {...register("fonte_informazione_altro")}
                    placeholder="Specifica fonte…"
                    className={`${cls.inp} mt-2`}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cls.lbl}>Giorni tra infortunio e referto</label>
                  <input
                    type="number"
                    min={0}
                    {...register("giorni_referto")}
                    placeholder="Es. 3"
                    className={`${cls.inp} mt-1`}
                  />
                </div>
                <div>
                  <label className={cls.lbl}>Modalità di insorgenza</label>
                  <Sel className="mt-1" {...register("modalita_insorgenza")}>
                    <option value="">—</option>
                    {["Improvvisa", "Graduale", "Altro"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Sel>
                </div>
              </div>

              {modalitaInsorgenza === "Altro" && (
                <div>
                  <label className={cls.lbl}>Specifica modalità</label>
                  <input
                    {...register("modalita_insorgenza_altro")}
                    placeholder="Descrivi…"
                    className={`${cls.inp} mt-1`}
                  />
                </div>
              )}
            </div>

            {/* ── B. Dettaglio contatto ───────────────────────────────── */}
            {/* hidden invece di smontare: così react-hook-form mantiene i valori registrati */}
            <div className={`pt-2 border-t border-gray-100 space-y-4${mostraSezioneB ? "" : " hidden"}`}>
                <p className={cls.sec}>B — Dettaglio del contatto</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={cls.lbl}>Tipo di contatto</label>
                    <Sel className="mt-1" {...register("contatto_dettaglio")}>
                      <option value="">—</option>
                      {["Durante un contrasto", "Subendo un contrasto", "Contatto con oggetto", "Collisione", "Altro"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Sel>
                  </div>
                  <div>
                    <label className={cls.lbl}>Situazione di duello</label>
                    <Sel className="mt-1" {...register("situazione_duello")}>
                      <option value="">—</option>
                      {["1v1", "1v2", "2v1", "Giocatori multipli su palla inattiva", "Altro"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Sel>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={cls.lbl}>Direzione del contrasto</label>
                    <Sel className="mt-1" {...register("direzione_contrasto")}>
                      <option value="">—</option>
                      {["Frontale", "Laterale-diagonale", "Da dietro", "Altro"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Sel>
                  </div>
                  <div>
                    <label className={cls.lbl}>Collisione con</label>
                    <Sel className="mt-1" {...register("collisione_con")}>
                      <option value="">—</option>
                      {["Compagno", "Avversario", "Arbitro", "Staff bordocampo", "Persona esterna", "Altro"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Sel>
                  </div>
                </div>

                <div>
                  <label className={cls.lbl}>Duello aereo</label>
                  <Sel className="mt-1" {...register("duello_aereo")}>
                    <option value="">—</option>
                    <option value="si">Sì</option>
                    <option value="no">No</option>
                  </Sel>
                </div>
              </div>

            {/* ── C. Attività fisica ──────────────────────────────────── */}
            <div className="pt-2 border-t border-gray-100 space-y-4">
              <p className={cls.sec}>C — Attività fisica al momento dell'infortunio</p>

              <div>
                <label className={cls.lbl}>Attività fisica</label>
                <Sel className="mt-1" {...register("attivita_fisica")}>
                  <option value="">—</option>
                  {["Corsa", "Salto", "Caduta", "Camminata", "Fermo", "Altro"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Sel>
              </div>

              {/* Corsa */}
              {attivitaFisica === "Corsa" && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div>
                    <label className={cls.lbl}>Tipo di corsa</label>
                    <Sel className="mt-1" {...register("tipo_corsa")}>
                      <option value="">—</option>
                      {["Lineare", "Curvilinea", "Cambio di direzione", "Corsa laterale", "Corsa all'indietro", "Altro"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Sel>
                  </div>

                  {tipoCorsa === "Cambio di direzione" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={cls.lbl}>Gradi cambio direzione</label>
                        <Sel className="mt-1" {...register("corsa_gradi")}>
                          <option value="">—</option>
                          {["0–45°", "46–90°", "91–135°", "136–180°"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Sel>
                      </div>
                      <div>
                        <label className={cls.lbl}>Gamba coinvolta</label>
                        <Sel className="mt-1" {...register("corsa_gamba_coinvolta")}>
                          <option value="">—</option>
                          {["Gamba infortunata", "Altra gamba"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Sel>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Salto */}
              {attivitaFisica === "Salto" && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div>
                    <label className={cls.lbl}>Fase del salto</label>
                    <Sel className="mt-1" {...register("salto_fase")}>
                      <option value="">—</option>
                      {["Pre-carico", "Stacco", "In aria", "Atterraggio"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Sel>
                  </div>

                  {saltoFase === "Atterraggio" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={cls.lbl}>Dove è avvenuto l'atterraggio</label>
                        <Sel className="mt-1" {...register("salto_atterraggio_dove")}>
                          <option value="">—</option>
                          {["Terreno di gioco", "Sulla palla", "Su altro giocatore", "Su altro oggetto", "Altro"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Sel>
                      </div>
                      <div>
                        <label className={cls.lbl}>Gamba di atterraggio</label>
                        <Sel className="mt-1" {...register("salto_gamba_atterraggio")}>
                          <option value="">—</option>
                          {["Entrambe", "Gamba infortunata", "Gamba sana", "Non applicabile"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Sel>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Caduta */}
              {attivitaFisica === "Caduta" && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <label className={cls.lbl}>Dettagli caduta</label>
                  <Sel className="mt-1" {...register("caduta_dettagli")}>
                    <option value="">—</option>
                    {["Scivolamento", "Contatto con il terreno", "Contatto con altro oggetto", "Altro"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Sel>
                </div>
              )}
            </div>

            {/* ── D. Situazione con la palla ──────────────────────────── */}
            <div className="pt-2 border-t border-gray-100 space-y-4">
              <div className="flex items-center justify-between">
                <p className={cls.sec}>D — Situazione con la palla</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500 font-medium">In azione con la palla?</span>
                  <div
                    onClick={() => {
                      const current = watch("azione_con_palla");
                      register("azione_con_palla").onChange({ target: { value: !current, name: "azione_con_palla" } });
                    }}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${azioneConPalla ? "bg-[#C8102E]" : "bg-gray-200"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${azioneConPalla ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                  <input type="checkbox" {...register("azione_con_palla")} className="sr-only" />
                </label>
              </div>

              {azioneConPalla && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={cls.lbl}>Situazione di gioco</label>
                      <Sel className="mt-1" {...register("situazione_gioco_palla")}>
                        <option value="">—</option>
                        {["Giocatore infortunato con palla", "Giocatore infortunato senza palla", "Palla contesa", "Altro"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Sel>
                    </div>
                    <div>
                      <label className={cls.lbl}>Attività con la palla</label>
                      <Sel className="mt-1" {...register("attivita_con_palla")}>
                        <option value="">—</option>
                        {["Calciare", "Ricevere la palla", "Corsa con la palla", "Colpo di testa"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Sel>
                    </div>
                  </div>

                  {attivitaConPalla === "Calciare" && (
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cls.lbl}>Azione</label>
                          <Sel className="mt-1" {...register("calcio_azione")}>
                            <option value="">—</option>
                            {["Passaggio", "Rinvio/Spazzata", "Tiro"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </Sel>
                        </div>
                        <div>
                          <label className={cls.lbl}>Intensità</label>
                          <Sel className="mt-1" {...register("calcio_intensita")}>
                            <option value="">—</option>
                            {["Debole", "Media", "Forte"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </Sel>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cls.lbl}>Tipo di calcio</label>
                          <Sel className="mt-1" {...register("calcio_tipo")}>
                            <option value="">—</option>
                            {["Collo del piede", "Esterno", "Interno", "Punta", "Tacco"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </Sel>
                        </div>
                        <div>
                          <label className={cls.lbl}>Fase del calcio</label>
                          <Sel className="mt-1" {...register("calcio_fase")}>
                            <option value="">—</option>
                            {["Pre-carico", "Carico", "Accelerazione", "Contatto con la palla", "Follow-through", "Contatto col terreno dopo il calcio"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </Sel>
                        </div>
                      </div>
                    </div>
                  )}

                  {attivitaConPalla === "Corsa con la palla" && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <label className={cls.lbl}>Tipo di dribbling</label>
                      <Sel className="mt-1" {...register("dribbling_tipo")}>
                        <option value="">—</option>
                        {["Corsa con la palla", "Dribbling per superare l'avversario"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Sel>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={cls.lbl}>Altezza della palla</label>
                      <Sel className="mt-1" {...register("palla_altezza")}>
                        <option value="">—</option>
                        {["A terra", "Altezza ginocchio", "Altezza anca", "Altezza busto", "Sopra la spalla"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Sel>
                    </div>
                    <div>
                      <label className={cls.lbl}>Controllo con</label>
                      <Sel className="mt-1" {...register("controllo_palla_con")}>
                        <option value="">—</option>
                        {["Piede", "Gamba bassa", "Coscia", "Busto", "Spalla", "Testa"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Sel>
                    </div>
                    <div>
                      <label className={cls.lbl}>Gamba infort. a contatto</label>
                      <Sel className="mt-1" {...register("gamba_infortunata_palla")}>
                        <option value="">—</option>
                        {["Sì", "No", "Non applicabile"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Sel>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── E. Dettagli della seduta ────────────────────────────── */}
            <div className="pt-2 border-t border-gray-100 space-y-4">
              <p className={cls.sec}>E — Dettagli della seduta</p>

              <div>
                <label className={cls.lbl}>Tipo di seduta</label>
                <div className="mt-2 flex gap-3">
                  {["Allenamento", "Partita"].map((v) => {
                    const active = tipoSeduta === v;
                    return (
                      <label key={v} className="flex-1 cursor-pointer">
                        <input type="radio" value={v} {...register("tipo_seduta")} className="sr-only" />
                        <div className={`text-center py-3 rounded-xl border text-sm font-semibold transition-all ${active ? "bg-[#C8102E] border-[#C8102E] text-white" : "border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                          {v}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {tipoSeduta === "Allenamento" && (
                <div>
                  <label className={cls.lbl}>Tipo di esercitazione</label>
                  <Sel className="mt-1" {...register("tipo_esercitazione")}>
                    <option value="">—</option>
                    {["Riscaldamento", "Tecnica bassa intensità", "Tecnica media intensità", "Tecnica alta intensità", "Tattica", "Partitella (SSG)", "Palla inattiva", "Condizionamento senza palla", "Palestra", "Altro"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Sel>
                </div>
              )}

              {tipoSeduta === "Partita" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={cls.lbl}>Sede</label>
                      <Sel className="mt-1" {...register("partita_sede")}>
                        <option value="">—</option>
                        {["Casa", "Trasferta"].map((v) => <option key={v}>{v}</option>)}
                      </Sel>
                    </div>
                    <div>
                      <label className={cls.lbl}>Punteggio al momento</label>
                      <Sel className="mt-1" {...register("partita_punteggio")}>
                        <option value="">—</option>
                        {["In vantaggio", "Pareggio", "In svantaggio"].map((v) => <option key={v}>{v}</option>)}
                      </Sel>
                    </div>
                  </div>
                  <div>
                    <label className={cls.lbl}>Competizione</label>
                    <Sel className="mt-1" {...register("partita_competizione")}>
                      <option value="">—</option>
                      {["Campionato", "Coppa nazionale", "Coppa internazionale", "Convocazione rappresentativa", "Amichevole", "Altra squadra dello stesso club", "Altro"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Sel>
                  </div>
                </div>
              )}
            </div>

            {/* ── F. Informazioni contestuali ──────────────────────────── */}
            {/* hidden invece di smontare: così react-hook-form mantiene i valori registrati */}
            <div className={`pt-2 border-t border-gray-100 space-y-4${mostraSezioneF ? "" : " hidden"}`}>
                <p className={cls.sec}>F — Informazioni contestuali</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={cls.lbl}>Fase di gioco</label>
                    <Sel className="mt-1" {...register("fase_gioco")}>
                      <option value="">—</option>
                      {["Offensiva", "Difensiva", "Non chiara"].map((v) => <option key={v}>{v}</option>)}
                    </Sel>
                  </div>
                  <div>
                    <label className={cls.lbl}>Terreno di gioco</label>
                    <Sel className="mt-1" {...register("terreno_gioco")}>
                      <option value="">—</option>
                      {["Erba naturale", "Erba artificiale", "Sabbia", "Altro"].map((v) => <option key={v}>{v}</option>)}
                    </Sel>
                  </div>
                </div>

                <div>
                  <label className={cls.lbl}>Sotto-fase di gioco</label>
                  <Sel className="mt-1" {...register("sotto_fase_gioco")}>
                    <option value="">—</option>
                    {["Calcio d'inizio", "Calcio d'angolo", "Punizione", "Rimessa laterale", "Rigore", "Rinvio del portiere", "Costruzione del gioco", "Fase offensiva", "Fase conclusiva", "Pressione alta", "Pressione media", "Pressione leggera", "Altro"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Sel>
                </div>

                <div>
                  <label className={cls.lbl}>Decisione arbitrale</label>
                  <Sel className="mt-1" {...register("decisione_arbitrale")}>
                    <option value="">—</option>
                    {["Punizione a favore", "Punizione contro", "Ammonizione al giocatore infortunato", "Ammonizione all'avversario", "Espulsione del giocatore infortunato", "Espulsione dell'avversario", "Nessun fallo"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Sel>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={cls.lbl}>Minuto dell'infortunio</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      {...register("minuto_infortunio")}
                      placeholder="Es. 34"
                      className={`${cls.inp} mt-1`}
                    />
                  </div>
                  <div>
                    <label className={cls.lbl}>Minuti giocati prima</label>
                    <input
                      type="number"
                      min={0}
                      {...register("minuti_giocati_prima")}
                      placeholder="Es. 34"
                      className={`${cls.inp} mt-1`}
                    />
                  </div>
                </div>
              </div>

          </div>
      </div>
    );
  }
);

DettaglioSituazionale.displayName = "DettaglioSituazionale";
export default DettaglioSituazionale;
