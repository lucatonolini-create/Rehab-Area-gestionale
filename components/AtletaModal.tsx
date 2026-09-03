"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { CATEGORIE, PIEDI, TIPI_INFORTUNIO, EVENTI_INFORTUNIO, MECCANISMI_INFORTUNIO, CONTATTI_INFORTUNIO, LATI_INFORTUNIO, POSIZIONI_INFORTUNIO, uid, type Atleta, type Stato, type Categoria, type Piede, type TipoInfortunio } from "@/lib/store";
import PlayerCombobox from "@/components/PlayerCombobox";
import DettaglioSituazionale, { type DettaglioSituazionaleHandle, type DettaglioSituazionaleForm } from "@/components/DettaglioSituazionale";
import OsiicsCombobox from "@/components/OsiicsCombobox";
import type { OsiicsCode } from "@/lib/store";

const STATI: Stato[] = ["Infortunato", "NTL", "Disponibile"];

const atletaVuoto: Omit<Atleta, "id"> = {
  nome: "", categoria: "" as Categoria,
  posizione: "", piedeDominante: "" as Piede,
  infortunio: "", inizioRehab: new Date().toISOString().slice(0, 10),
  stato: "Infortunato", progresso: 0,
  fisioterapista: "", preparatoreAtletico: "",
  telefono: "", email: "", note: "",
  peso: undefined, altezza: undefined,
  plicometrieMedie: undefined, dataNascita: undefined, altezzaDaSeduto: undefined,
};

const CAT_ANTRO = ["U19", "U17", "U16", "U15", "U14"] as const;
const CAT_PHV   = ["U15", "U14"] as const;

function calcolaPHV(peso: number, altezza: number, altezzaDaSeduto: number, dataNascita: string) {
  const eta = (Date.now() - new Date(dataNascita + "T12:00").getTime()) / (365.25 * 24 * 3600 * 1000);
  if (eta <= 0 || eta > 20) return null;
  const gambe = altezza - altezzaDaSeduto;
  const offset = -9.236
    + 0.0002708 * (gambe * altezzaDaSeduto)
    - 0.001663  * (eta * gambe)
    + 0.007216  * (eta * altezzaDaSeduto)
    + 0.02292   * (peso / altezza * 100);
  return { offset, etaPHV: eta - offset };
}

interface Props {
  atletaIniziale?: Atleta;
  initialDettaglio?: Partial<DettaglioSituazionaleForm>;
  onSalva: (dati: Omit<Atleta, "id">, atletaId: string, dettaglio?: DettaglioSituazionaleForm) => void;
  onChiudi: () => void;
}

function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  if (type === "date") {
    return (
      <div className={`mt-1 w-full border border-gray-200 rounded-xl px-4 focus-within:ring-2 focus-within:ring-[#C8102E] bg-white ${className ?? ""}`}>
        <input type="date" {...props}
          className="w-full py-3 text-sm bg-transparent border-0 outline-none focus:outline-none text-gray-900" />
      </div>
    );
  }
  return (
    <input type={type} {...props}
      className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] ${className ?? ""}`} />
  );
}

function Sel(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...props}
      className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white ${props.className ?? ""}`} />
  );
}

function Label({ children }: { children: string }) {
  return <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{children}</label>;
}

export default function AtletaModal({ atletaIniziale, initialDettaglio, onSalva, onChiudi }: Props) {
  const isModifica = !!atletaIniziale;
  const [form, setForm] = useState<Omit<Atleta, "id">>(
    atletaIniziale ? (({ id, ...rest }) => rest)(atletaIniziale) : atletaVuoto
  );
  const f = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // Tipologia infortunio per il form (TL o NTLI)
  const [tipoGestione, setTipoGestione] = useState<"TL" | "NTLI">("TL");

  // ID pre-generato per poter salvare il dettaglio con la FK corretta
  const [atletaId] = useState(() => atletaIniziale?.id ?? uid());
  const dettaglioRef = useRef<DettaglioSituazionaleHandle>(null);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">
            {isModifica ? "Modifica Atleta" : "Nuovo Atleta"}
          </h2>
          <button onClick={onChiudi}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Tipologia infortunio — solo in creazione */}
          {!isModifica && (
            <div>
              <Label>Tipologia infortunio</Label>
              <div className="mt-2 flex gap-2">
                {(["TL", "NTLI"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTipoGestione(t)}
                    className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${
                      tipoGestione === t ? "bg-[#C8102E] text-white border-[#C8102E]" : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}>
                    {t === "TL" ? "Time Loss Injury (TL)" : "NTLI – Non-Time-Loss Injury"}
                  </button>
                ))}
              </div>
              {tipoGestione === "NTLI" && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-sm text-amber-800">
                    Per creare un NTLI usa la sezione dedicata →{" "}
                    <a href="/ntli" onClick={onChiudi} className="font-semibold underline text-amber-900 hover:text-[#C8102E]">
                      Vai a NTLI
                    </a>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Mostra il resto del form solo se TL (o in modifica) */}
          {(isModifica || tipoGestione === "TL") && (<>
          <div>
            <Label>Cognome e Nome *</Label>
            <PlayerCombobox
              className="mt-1"
              value={form.nome}
              onSelect={(nome, g) => {
                f("nome", nome);
                if (g) { f("categoria", g.categoria as Categoria); f("posizione", g.ruolo); }
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Sel className="mt-1" value={form.categoria} onChange={(e) => f("categoria", e.target.value as Categoria)}>
                <option value="">—</option>
                {CATEGORIE.map((c) => <option key={c}>{c}</option>)}
              </Sel>
            </div>
            <div>
              <Label>Piede dominante</Label>
              <Sel className="mt-1" value={form.piedeDominante} onChange={(e) => f("piedeDominante", e.target.value as Piede)}>
                <option value="">—</option>
                {PIEDI.map((p) => <option key={p}>{p}</option>)}
              </Sel>
            </div>
          </div>

          <div>
            <Label>Ruolo / Posizione</Label>
            <Input className="mt-1" value={form.posizione} onChange={(e) => f("posizione", e.target.value)} placeholder="Es. Centrocampista" />
          </div>

          <div>
            <Label>Tipologia</Label>
            <Sel className="mt-1" value={form.tipoInfortunio ?? ""} onChange={(e) => f("tipoInfortunio", e.target.value as TipoInfortunio)}>
              <option value="">—</option>
              {TIPI_INFORTUNIO.map((t) => <option key={t}>{t}</option>)}
            </Sel>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Evento</Label>
              <Sel className="mt-1" value={form.evento ?? ""} onChange={(e) => f("evento", e.target.value)}>
                <option value="">—</option>
                {EVENTI_INFORTUNIO.map((v) => <option key={v}>{v}</option>)}
              </Sel>
            </div>
            <div>
              <Label>Contatto</Label>
              <Sel className="mt-1" value={form.contatto ?? ""} onChange={(e) => f("contatto", e.target.value)}>
                <option value="">—</option>
                {CONTATTI_INFORTUNIO.map((v) => <option key={v}>{v}</option>)}
              </Sel>
            </div>
          </div>

          <div>
            <Label>Meccanismo</Label>
            <Sel className="mt-1" value={form.meccanismo ?? ""} onChange={(e) => f("meccanismo", e.target.value)}>
              <option value="">—</option>
              {MECCANISMI_INFORTUNIO.map((v) => <option key={v}>{v}</option>)}
            </Sel>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lato</Label>
              <Sel className="mt-1" value={form.lato ?? ""} onChange={(e) => f("lato", e.target.value)}>
                <option value="">—</option>
                {LATI_INFORTUNIO.map((v) => <option key={v}>{v}</option>)}
              </Sel>
            </div>
            <div>
              <Label>Posizione</Label>
              <Sel className="mt-1" value={form.posizioneInfortunio ?? ""} onChange={(e) => f("posizioneInfortunio", e.target.value)}>
                <option value="">—</option>
                {POSIZIONI_INFORTUNIO.map((v) => <option key={v}>{v}</option>)}
              </Sel>
            </div>
          </div>

          <div>
            <Label>Diagnosi / Infortunio</Label>
            <Input className="mt-1" value={form.infortunio} onChange={(e) => f("infortunio", e.target.value)} placeholder="Es. Lesione LCA" />
          </div>

          <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/40 space-y-2">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Classificazione OSIICS</p>
            <OsiicsCombobox
              value={form.osiicsCodeId ? { id: form.osiicsCodeId, codice: form.osiicsCodice ?? "", descrizioneIta: form.osiicsDescrizione ?? "" } : null}
              onChange={(code: OsiicsCode | null) => {
                if (code) {
                  f("osiicsCodeId", code.id);
                  f("osiicsCodice", code.codice);
                  f("osiicsDescrizione", code.descrizioneIta);
                } else {
                  f("osiicsCodeId", undefined);
                  f("osiicsCodice", undefined);
                  f("osiicsDescrizione", undefined);
                }
              }}
            />
          </div>

          <div>
            <Label>Inizio Riabilitazione</Label>
            <Input className="mt-1" type="date" value={form.inizioRehab} onChange={(e) => f("inizioRehab", e.target.value)} />
          </div>

          <div>
            <Label>Stato</Label>
            <Sel className="mt-1" value={form.stato} onChange={(e) => f("stato", e.target.value as Stato)}>
              {STATI.map((s) => <option key={s}>{s}</option>)}
            </Sel>
          </div>

          {(form.stato === "Disponibile" || form.stato === "NTL") && (
            <div>
              <Label>Data fine riabilitazione</Label>
              <Input className="mt-1" type="date" value={form.fineRehab ?? ""} onChange={(e) => f("fineRehab", e.target.value)} />
            </div>
          )}


          <div>
            <Label>Note</Label>
            <textarea value={form.note} onChange={(e) => f("note", e.target.value)}
              placeholder="Note aggiuntive..." rows={3}
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none" />
          </div>

          {/* Dati antropometrici — visibili solo per categorie giovanili */}
          {CAT_ANTRO.includes(form.categoria as typeof CAT_ANTRO[number]) && (
            <div className="border border-purple-100 rounded-xl p-3 bg-purple-50/40 space-y-3">
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Dati Antropometrici</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Peso (kg)</Label>
                  <Input className="mt-1" type="number" min="0" step="0.1"
                    value={form.peso ?? ""} onChange={(e) => f("peso", e.target.value || undefined)}
                    placeholder="Es. 70" />
                </div>
                <div>
                  <Label>Altezza (cm)</Label>
                  <Input className="mt-1" type="number" min="0" step="0.1"
                    value={form.altezza ?? ""} onChange={(e) => f("altezza", e.target.value || undefined)}
                    placeholder="Es. 175" />
                </div>
                <div>
                  <Label>Plicometria media (mm)</Label>
                  <Input className="mt-1" type="number" min="0" step="0.1"
                    value={form.plicometrieMedie ?? ""} onChange={(e) => f("plicometrieMedie", e.target.value || undefined)}
                    placeholder="Es. 10" />
                </div>
              </div>
              {CAT_PHV.includes(form.categoria as typeof CAT_PHV[number]) && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Data di nascita</Label>
                      <Input className="mt-1" type="date"
                        value={form.dataNascita ?? ""} onChange={(e) => f("dataNascita", e.target.value || undefined)} />
                    </div>
                    <div>
                      <Label>Altezza da seduto (cm)</Label>
                      <Input className="mt-1" type="number" min="0" step="0.1"
                        value={form.altezzaDaSeduto ?? ""} onChange={(e) => f("altezzaDaSeduto", e.target.value || undefined)}
                        placeholder="Es. 88" />
                    </div>
                  </div>
                  {form.peso && form.altezza && form.altezzaDaSeduto && form.dataNascita && (() => {
                    const phv = calcolaPHV(parseFloat(form.peso!), parseFloat(form.altezza!), parseFloat(form.altezzaDaSeduto!), form.dataNascita!);
                    if (!phv) return null;
                    return (
                      <div className="bg-white border border-purple-100 rounded-lg px-3 py-2 text-xs text-center">
                        <span className="text-gray-500">PHV stimato: </span>
                        <span className="font-bold text-purple-700">{phv.etaPHV.toFixed(1)} anni</span>
                        <span className="text-gray-400 ml-2">
                          (offset: {phv.offset >= 0 ? "+" : ""}{phv.offset.toFixed(2)} anni da PHV)
                        </span>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Dettaglio situazionale FIICCS — per atleti con infortunio attivo (TL e NTL) */}
          {(form.stato === "Infortunato" || form.stato === "NTL") && (
            <DettaglioSituazionale ref={dettaglioRef} contatto={form.contatto} initialValues={initialDettaglio} />
          )}

          </>) } {/* end TL-only section */}

        </div>

        <div className="flex gap-3 p-6 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onChiudi}
            className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
            Annulla
          </button>
          {(isModifica || tipoGestione === "TL") && (
          <button onClick={() => {
              if (!isModifica && !form.nome.trim()) return;
              const det = (dettaglioRef.current?.hasData() || !!initialDettaglio) ? dettaglioRef.current?.getValues() : undefined;
              onSalva(form, atletaId, det);
            }} disabled={!isModifica && !form.nome.trim()}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-xl text-sm font-medium hover:bg-red-800 disabled:opacity-40">
            {isModifica ? "Salva modifiche" : "Aggiungi atleta"}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
