"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";

export default function ModuloCartaceoPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="flex-1 text-base font-bold text-gray-900">Modulo cartaceo</h1>
        <a
          href="/modulo_cartaceo.pdf"
          download="modulo_cartaceo.pdf"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-[#C8102E] text-white hover:bg-red-800 transition-colors"
        >
          <FileDown className="w-4 h-4" />
          Scarica
        </a>
      </div>

      {/* PDF viewer */}
      <div className="flex-1 overflow-hidden bg-gray-100">
        <iframe
          src="/modulo_cartaceo.pdf"
          className="w-full h-full border-0"
          title="Modulo cartaceo segnalazione infortunio"
        />
      </div>
    </div>
  );
}
