"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Plus, Trash2, Check, RefreshCw, AlertCircle, Bell, BellOff, Send, Download, X } from "lucide-react";
import { loadImpostazioni, saveImpostazioni, pushAllLocalToSupabase, loadAtleti, upsertAtleta, loadProgrammi, type Impostazioni, type GiocatoreRosa } from "@/lib/store";
import { esportaExcel } from "@/lib/exportExcel";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

function BackupSection() {
  const [stato, setStato] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  const esporta = async () => {
    setStato("loading");
    setMsg("");
    try {
      const atleti = await loadAtleti();
      const programmi = await Promise.all(atleti.map((a) => loadProgrammi(a.id))).then((r) => r.flat());
      const payload = {
        esportato_il: new Date().toISOString(),
        atleti,
        programmi,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rehab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStato("ok");
      setMsg(`Esportati ${atleti.length} atleti e ${programmi.length} programmi.`);
    } catch (err) {
      setStato("error");
      setMsg(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setStato("idle"), 6000);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h2 className="font-bold text-gray-900 mb-1">Backup dati</h2>
      <p className="text-sm text-gray-500 mb-4">
        Scarica una copia di tutti gli atleti e i programmi in formato JSON. Conservala come backup manuale.
      </p>
      <button
        onClick={esporta}
        disabled={stato === "loading"}
        className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
          stato === "ok" ? "bg-green-500 text-white" :
          stato === "error" ? "bg-orange-500 text-white" :
          "bg-[#2B2B2B] text-white hover:bg-black"
        }`}
      >
        {stato === "loading"
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Esportazione…</>
          : stato === "ok"
          ? <><Check className="w-4 h-4" /> Scaricato!</>
          : stato === "error"
          ? <><AlertCircle className="w-4 h-4" /> Errore</>
          : <><Download className="w-4 h-4" /> Esporta backup JSON</>}
      </button>
      {msg && (
        <p className={`mt-3 text-xs font-medium ${stato === "error" ? "text-orange-600" : "text-green-600"}`}>
          {msg}
        </p>
      )}
      <p className="mt-3 text-xs text-gray-400">
        Per backup automatici abilitare i Point-in-Time Recovery nel pannello Supabase (piano Pro).
      </p>
    </div>
  );
}

function ExcelSection() {
  const [stato, setStato] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  const esporta = async () => {
    setStato("loading");
    setMsg("");
    try {
      await esportaExcel();
      setStato("ok");
      setMsg("File Excel scaricato con tutti i dati.");
    } catch (err) {
      setStato("error");
      setMsg(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setStato("idle"), 6000);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h2 className="font-bold text-gray-900 mb-1">Esporta Excel</h2>
      <p className="text-sm text-gray-500 mb-4">
        Scarica un file .xlsx con tutti i dati: atleti, infortuni, referti, programmi, esercizi, test fisici e carichi.
        Ogni sezione dell&apos;app diventa un foglio separato.
      </p>
      <button
        onClick={esporta}
        disabled={stato === "loading"}
        className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
          stato === "ok" ? "bg-green-500 text-white" :
          stato === "error" ? "bg-orange-500 text-white" :
          "bg-[#2B2B2B] text-white hover:bg-black"
        }`}
      >
        {stato === "loading"
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generazione…</>
          : stato === "ok"
          ? <><Check className="w-4 h-4" /> Scaricato!</>
          : stato === "error"
          ? <><AlertCircle className="w-4 h-4" /> Errore</>
          : <><Download className="w-4 h-4" /> Esporta Excel (.xlsx)</>}
      </button>
      {msg && (
        <p className={`mt-3 text-xs font-medium ${stato === "error" ? "text-orange-600" : "text-green-600"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}

function NotificheSection() {
  const [permesso, setPermesso] = useState<NotificationPermission | "unsupported">("default");
  const [attiva, setAttiva] = useState<boolean | null>(null);
  const [stato, setStato] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [testStato, setTestStato] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermesso("unsupported");
      return;
    }
    setPermesso(Notification.permission);
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setAttiva(!!sub))
    ).catch(() => setAttiva(false));
  }, []);

  const abilita = async () => {
    if (!VAPID_PUBLIC_KEY) {
      setStato("error");
      setMsg("Chiave VAPID non configurata (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
      return;
    }
    setStato("loading");
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      setPermesso(perm);
      if (perm !== "granted") {
        setStato("error");
        setMsg("Permesso negato. Abilitalo nelle impostazioni del browser.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error ?? "Errore salvataggio sottoscrizione");
      setAttiva(true);
      setStato("ok");
      setMsg("Notifiche attivate su questo dispositivo.");
    } catch (err) {
      setStato("error");
      setMsg(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setStato("idle"), 5000);
  };

  const disabilita = async () => {
    setStato("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setAttiva(false);
      setStato("ok");
      setMsg("Notifiche disattivate.");
    } catch (err) {
      setStato("error");
      setMsg(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setStato("idle"), 4000);
  };

  const inviaTest = async () => {
    setTestStato("loading");
    setTestMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setTestStato("error");
        setTestMsg("Nessuna sottoscrizione attiva. Prima abilita le notifiche.");
        setTimeout(() => setTestStato("idle"), 4000);
        return;
      }
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Errore sconosciuto");
      setTestStato("ok");
      setTestMsg("Notifica inviata — dovresti riceverla a breve.");
    } catch (err) {
      setTestStato("error");
      setTestMsg(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setTestStato("idle"), 6000);
  };

  if (permesso === "unsupported") {
    return (
      <p className="text-sm text-gray-400">
        Questo browser non supporta le notifiche push.
      </p>
    );
  }

  const isLoading = stato === "loading";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${attiva ? "bg-green-500" : "bg-gray-300"}`} />
        <span className="text-sm text-gray-700">
          {attiva === null ? "Verifica in corso…" : attiva ? "Attive su questo dispositivo" : "Non attive su questo dispositivo"}
        </span>
      </div>

      {permesso === "denied" && (
        <p className="text-xs text-orange-600">
          Permesso bloccato. Vai nelle impostazioni del browser e abilita le notifiche per questo sito.
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {!attiva && permesso !== "denied" && (
          <button
            onClick={abilita}
            disabled={isLoading}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
              stato === "ok" ? "bg-green-500 text-white" :
              stato === "error" ? "bg-orange-500 text-white" :
              "bg-[#C8102E] text-white hover:bg-red-800"
            }`}>
            {isLoading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Attivazione…</>
              : stato === "ok"
              ? <><Check className="w-4 h-4" /> Attivate!</>
              : stato === "error"
              ? <><AlertCircle className="w-4 h-4" /> Riprova</>
              : <><Bell className="w-4 h-4" /> Abilita notifiche</>}
          </button>
        )}
        {attiva && (
          <>
            <button
              onClick={abilita}
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-[#2B2B2B] text-white hover:bg-black transition-all">
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Riattiva
            </button>
            <button
              onClick={disabilita}
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all">
              <BellOff className="w-4 h-4" />
              Disabilita
            </button>
          </>
        )}
      </div>

      {msg && (
        <p className={`text-xs font-medium ${stato === "error" ? "text-orange-600" : "text-green-600"}`}>
          {msg}
        </p>
      )}

      {attiva && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">Verifica che le notifiche arrivino su questo dispositivo:</p>
          <button
            onClick={inviaTest}
            disabled={testStato === "loading"}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              testStato === "ok" ? "bg-green-500 text-white" :
              testStato === "error" ? "bg-orange-500 text-white" :
              "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {testStato === "loading"
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Invio…</>
              : testStato === "ok"
              ? <><Check className="w-4 h-4" /> Inviata!</>
              : testStato === "error"
              ? <><AlertCircle className="w-4 h-4" /> Errore</>
              : <><Send className="w-4 h-4" /> Invia notifica test</>}
          </button>
          {testMsg && (
            <p className={`mt-2 text-xs font-medium ${testStato === "error" ? "text-orange-600" : "text-green-600"}`}>
              {testMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ListaPersonale({
  titolo,
  lista,
  placeholder,
  onAggiungi,
  onRimuovi,
}: {
  titolo: string;
  lista: string[];
  placeholder: string;
  onAggiungi: (v: string) => void;
  onRimuovi: (i: number) => void;
}) {
  const [input, setInput] = useState("");
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{titolo}</h3>
      <div className="space-y-2 mb-3">
        {lista.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">Nessuno ancora</p>
        )}
        {lista.map((s, i) => (
          <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <span className="flex-1 text-sm text-gray-900">{s}</span>
            <button onClick={() => onRimuovi(i)} className="text-gray-300 hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { onAggiungi(input.trim()); setInput(""); } }}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        <button onClick={() => { if (input.trim()) { onAggiungi(input.trim()); setInput(""); } }}
          className="flex items-center gap-1.5 bg-[#C8102E] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-800">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const CATEGORIE = ["1ª Squadra", "U19", "U17", "U16", "U15", "U14", "Altra squadra", "Provino"];
const RUOLI_ROSA = ["Attaccante", "Centrocampista", "Difensore", "Portiere"];

function RosaSection({
  rosa,
  onChange,
  onRenameAtleta,
}: {
  rosa: GiocatoreRosa[];
  onChange: (r: GiocatoreRosa[]) => Promise<void> | void;
  onRenameAtleta?: (oldNome: string, newNome: string) => Promise<void>;
}) {
  const vuotoForm: GiocatoreRosa = { nome: "", categoria: "", ruolo: "" };
  const [selectedNome, setSelectedNome] = useState("");
  const [form, setForm] = useState<GiocatoreRosa>(vuotoForm);
  const [stato, setStato] = useState<"idle" | "ok" | "error">("idle");

  const sorted = [...rosa].sort((a, b) => a.nome.localeCompare(b.nome));

  const seleziona = (nome: string) => {
    setSelectedNome(nome);
    const g = rosa.find((r) => r.nome === nome);
    setForm(g ? { ...g } : vuotoForm);
  };

  const salva = async () => {
    if (!form.nome.trim() || !form.categoria || !form.ruolo) return;
    const nome = form.nome.trim();
    let nuovaRosa: GiocatoreRosa[];
    if (selectedNome) {
      nuovaRosa = rosa.map((g) => g.nome === selectedNome ? { ...form, nome } : g);
    } else {
      if (rosa.some((g) => g.nome.toLowerCase() === nome.toLowerCase())) return;
      nuovaRosa = [...rosa, { ...form, nome }];
    }
    try {
      await onChange(nuovaRosa);
      if (selectedNome && nome !== selectedNome && onRenameAtleta) {
        await onRenameAtleta(selectedNome, nome);
      }
      setStato("ok");
    } catch {
      setStato("error");
    }
    setSelectedNome("");
    setForm(vuotoForm);
    setTimeout(() => setStato("idle"), 2500);
  };

  const rimuovi = async () => {
    if (!selectedNome) return;
    await onChange(rosa.filter((g) => g.nome !== selectedNome));
    setSelectedNome("");
    setForm(vuotoForm);
  };

  const fieldCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white";

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seleziona giocatore</label>
        <select value={selectedNome} onChange={(e) => seleziona(e.target.value)}
          className={`mt-1 ${fieldCls}`}>
          <option value="">— Nuovo giocatore —</option>
          {sorted.map((g) => (
            <option key={g.nome} value={g.nome}>{g.nome} ({g.categoria} · {g.ruolo})</option>
          ))}
        </select>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cognome e Nome</label>
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Es. Rossi Mario"
            className={`mt-1 ${fieldCls}`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</label>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              className={`mt-1 ${fieldCls}`}>
              <option value="">—</option>
              {CATEGORIE.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ruolo</label>
            <select value={form.ruolo} onChange={(e) => setForm({ ...form, ruolo: e.target.value })}
              className={`mt-1 ${fieldCls}`}>
              <option value="">—</option>
              {RUOLI_ROSA.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1 items-center">
          <button onClick={salva}
            disabled={!form.nome.trim() || !form.categoria || !form.ruolo}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
              stato === "ok" ? "bg-green-500 text-white" :
              stato === "error" ? "bg-orange-500 text-white" :
              "bg-[#C8102E] text-white hover:bg-red-800"
            }`}>
            <Check className="w-4 h-4" />
            {stato === "ok"
              ? "Salvato!"
              : stato === "error"
              ? "Errore"
              : selectedNome ? "Salva modifiche" : "Aggiungi giocatore"}
          </button>
          {selectedNome && stato === "idle" && (
            <button onClick={rimuovi}
              className="flex items-center gap-2 border border-red-200 text-red-500 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" /> Elimina
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImpostazioniPage() {
  const [form, setForm] = useState<Impostazioni>({
    nomeClub: "", nomeStruttura: "", indirizzo: "", fisioterapisti: [], preparatori: [], rosa: [],
  });
  const [salvato, setSalvato] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    loadImpostazioni().then(async (imp) => {
      try {
        const res = await fetch("/api/players");
        const players = await res.json();
        if (Array.isArray(players) && players.length > 0) {
          // merge: keep existing rosa entries, add players from atleti not yet in rosa
          const merged = [...imp.rosa];
          for (const p of players) {
            if (!merged.some((g) => g.nome.toLowerCase() === p.nome.toLowerCase())) {
              merged.push(p);
            }
          }
          imp = { ...imp, rosa: merged };
        }
      } catch {}
      setForm(imp);
    });
  }, []);

  const salva = async () => {
    await saveImpostazioni(form);
    setSalvato(true);
    setTimeout(() => setSalvato(false), 2000);
  };

  const sincronizza = async () => {
    setSyncState("loading");
    setSyncMsg("");
    const { ok, fail, lastError } = await pushAllLocalToSupabase();
    if (fail === 0) {
      setSyncState("ok");
      setSyncMsg(`Sincronizzati ${ok} elementi con successo.`);
    } else {
      setSyncState("error");
      setSyncMsg(`${ok} sincronizzati, ${fail} falliti.${lastError ? ` Errore: ${lastError}` : ""}`);
    }
    setTimeout(() => setSyncState("idle"), 8000);
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Impostazioni</h1>
          <p className="text-gray-500 mt-1">Configura il tuo gestionale</p>
        </div>
        <button onClick={salva}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            salvato ? "bg-green-500 text-white" : "bg-[#C8102E] text-white hover:bg-red-800"
          }`}>
          {salvato ? <><Check className="w-4 h-4" /> Salvato!</> : <><Save className="w-4 h-4" /> Salva</>}
        </button>
      </div>

      <div className="space-y-5">
        {/* Club */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-4">Club e struttura</h2>
          <div className="space-y-4">
            {[
              { label: "Nome Club",                key: "nomeClub"      as keyof Impostazioni, ph: "Es. U.S. Cremonese" },
              { label: "Nome struttura / reparto", key: "nomeStruttura" as keyof Impostazioni, ph: "Es. Rehab Area" },
              { label: "Indirizzo",                key: "indirizzo"     as keyof Impostazioni, ph: "Es. Via dello Sport 1, Cremona" },
            ].map(({ label, key, ph }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
                <input value={form[key] as string}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={ph}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
            ))}
          </div>
        </div>

        {/* Staff */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
          <h2 className="font-bold text-gray-900">Staff tecnico e medico</h2>

          <ListaPersonale
            titolo="Fisioterapisti"
            lista={form.fisioterapisti}
            placeholder="Es. Dott. Marco Conti"
            onAggiungi={(v) => setForm({ ...form, fisioterapisti: [...form.fisioterapisti, v] })}
            onRimuovi={(i) => setForm({ ...form, fisioterapisti: form.fisioterapisti.filter((_, idx) => idx !== i) })}
          />

          <div className="border-t border-gray-100 pt-6">
            <ListaPersonale
              titolo="Preparatori atletici"
              lista={form.preparatori}
              placeholder="Es. Sig. Luigi Rossi"
              onAggiungi={(v) => setForm({ ...form, preparatori: [...form.preparatori, v] })}
              onRimuovi={(i) => setForm({ ...form, preparatori: form.preparatori.filter((_, idx) => idx !== i) })}
            />
          </div>
        </div>

        {/* Rosa giocatori */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-1">Rosa giocatori</h2>
          <p className="text-sm text-gray-500 mb-4">
            Aggiungi, modifica o rimuovi i giocatori che appaiono nel form di segnalazione infortuni.
          </p>
          <RosaSection
            rosa={form.rosa}
            onChange={async (r) => {
              const nuovoForm = { ...formRef.current, rosa: r };
              setForm(nuovoForm);
              await saveImpostazioni(nuovoForm);
            }}
            onRenameAtleta={async (oldNome, newNome) => {
              const atleti = await loadAtleti();
              const match = atleti.find(
                (a) => (a.nome ?? "").toLowerCase() === oldNome.toLowerCase() ||
                        (a.nomeCompleto ?? "").toLowerCase() === oldNome.toLowerCase()
              );
              if (match) {
                await upsertAtleta({ ...match, nome: newNome, nomeCompleto: undefined });
              }
            }}
          />
        </div>

        {/* Notifiche push */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-1">Notifiche push</h2>
          <p className="text-sm text-gray-500 mb-4">
            Ricevi una notifica su questo dispositivo quando viene segnalato un nuovo infortunio. Ogni dispositivo va abilitato separatamente.
          </p>
          <NotificheSection />
        </div>

        {/* Backup / Export dati */}
        <BackupSection />

        {/* Esporta Excel */}
        <ExcelSection />

        {/* Sincronizzazione */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-1">Sincronizzazione dati</h2>
          <p className="text-sm text-gray-500 mb-4">
            Se i dati non compaiono su altri dispositivi, usa questo pulsante per forzare l&apos;upload di tutto il contenuto locale verso il server.
          </p>
          <button onClick={sincronizza} disabled={syncState === "loading"}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
              syncState === "ok" ? "bg-green-500 text-white" :
              syncState === "error" ? "bg-orange-500 text-white" :
              "bg-[#2B2B2B] text-white hover:bg-black"
            }`}>
            {syncState === "loading"
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sincronizzazione in corso…</>
              : syncState === "ok"
              ? <><Check className="w-4 h-4" /> Sincronizzato!</>
              : syncState === "error"
              ? <><AlertCircle className="w-4 h-4" /> Errore parziale</>
              : <><RefreshCw className="w-4 h-4" /> Sincronizza ora</>}
          </button>
          {syncMsg && (
            <p className={`mt-3 text-xs font-medium ${syncState === "error" ? "text-orange-600" : "text-green-600"}`}>
              {syncMsg}
            </p>
          )}
        </div>

<p className="text-xs text-gray-400 text-center">
          Premi "Salva" per confermare le modifiche.
        </p>
      </div>
    </div>
  );
}
