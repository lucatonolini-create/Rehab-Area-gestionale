"use client";

import { useState, useEffect, useRef } from "react";
import { Copy, Check, Link2, FileDown } from "lucide-react";

const CATEGORIE = ["U19", "U17", "U16", "U15", "U14"] as const;

export default function SegnalazioniPage() {
  const [origin, setOrigin] = useState("");
  const [copiato, setCopiato] = useState<string | null>(null);
  const pdfBlob = useRef<Blob | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    // Pre-fetch il blob in modo che il click sia sincrono (come doc.save() di jsPDF)
    fetch("/modulo_cartaceo.pdf").then(r => r.blob()).then(b => { pdfBlob.current = b; });
  }, []);

  const apriModuloCartaceo = () => {
    const blob = pdfBlob.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modulo_cartaceo.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copia = async (cat: string) => {
    const url = `${origin}/intake/${cat.toLowerCase()}`;
    await navigator.clipboard.writeText(url);
    setCopiato(cat);
    setTimeout(() => setCopiato(null), 2000);
  };


  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Link fisioterapisti</h1>
        <p className="text-sm text-gray-500 mt-1">
          Condividi il link della categoria con il fisioterapista di riferimento.
          Quando compila il form, il giocatore viene aggiunto automaticamente al gestionale.
        </p>
      </div>

      <div className="space-y-3">
        {CATEGORIE.map((cat) => {
          const url = origin ? `${origin}/intake/${cat.toLowerCase()}` : "Caricamento…";
          const isCopied = copiato === cat;
          return (
            <div key={cat} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#C8102E] flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{cat}</p>
                <p className="text-xs text-gray-400 truncate">{url}</p>
              </div>
              <button
                onClick={() => copia(cat)}
                disabled={!origin}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                  isCopied
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? "Copiato" : "Copia"}
              </button>
            </div>
          );
        })}

        <button
          onClick={apriModuloCartaceo}
          className="w-full flex items-center gap-4 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-[#2B2B2B] flex items-center justify-center shrink-0">
            <FileDown className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Modulo cartaceo</p>
            <p className="text-xs text-gray-400">Segnalazione infortunio — PDF stampabile</p>
          </div>
          <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 shrink-0">
            <FileDown className="w-3.5 h-3.5" />
            Apri
          </span>
        </button>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Come funziona:</strong> il fisioterapista apre il link, compila il form con i dati del giocatore infortunato e lo invia.
          Il giocatore appare subito nella sezione <strong>Atleti</strong> con stato <strong>Infortunato</strong>.
        </p>
      </div>
    </div>
  );
}
