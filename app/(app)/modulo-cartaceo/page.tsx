"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, FileDown, Share2, Printer } from "lucide-react";
import { useState } from "react";

async function getPdfBlob(): Promise<Blob> {
  const res = await fetch("/modulo_cartaceo.pdf");
  if (!res.ok) throw new Error("Errore nel caricamento del PDF");
  return res.blob();
}

export default function ModuloCartaceoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<"share" | "download" | "print" | null>(null);

  const handleShare = async () => {
    setLoading("share");
    try {
      const blob = await getPdfBlob();
      const file = new File([blob], "modulo_cartaceo.pdf", { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Modulo cartaceo — Segnalazione Infortunio" });
      } else {
        // fallback: download diretto
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "modulo_cartaceo.pdf";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") console.error(e);
    } finally {
      setLoading(null);
    }
  };

  const handleDownload = async () => {
    setLoading("download");
    try {
      const blob = await getPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modulo_cartaceo.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  };

  const handlePrint = async () => {
    setLoading("print");
    try {
      const blob = await getPdfBlob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url);
      if (win) {
        win.onload = () => {
          win.print();
          URL.revokeObjectURL(url);
        };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-6 max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-gray-700 shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modulo cartaceo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Segnalazione Infortunio — 5 pagine A4</p>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-4">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-[#C8102E] flex items-center justify-center shrink-0">
            <FileDown className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900">modulo_cartaceo.pdf</p>
            <p className="text-xs text-gray-400">Versione stampabile con caselle da spuntare a mano</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleShare}
            disabled={!!loading}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold bg-[#C8102E] text-white hover:bg-red-800 transition-colors disabled:opacity-60"
          >
            <Share2 className="w-4 h-4" />
            {loading === "share" ? "Caricamento…" : "Condividi"}
          </button>

          <button
            onClick={handleDownload}
            disabled={!!loading}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold bg-[#2B2B2B] text-white hover:bg-black transition-colors disabled:opacity-60"
          >
            <FileDown className="w-4 h-4" />
            {loading === "download" ? "Caricamento…" : "Scarica"}
          </button>

          <button
            onClick={handlePrint}
            disabled={!!loading}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <Printer className="w-4 h-4" />
            {loading === "print" ? "Caricamento…" : "Stampa"}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          Su dispositivo mobile il tasto <strong>Condividi</strong> apre il menu di sistema per salvare, stampare o inviare il file.
        </p>
      </div>
    </div>
  );
}
