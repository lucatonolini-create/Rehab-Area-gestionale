"use client";

import { ClipboardList } from "lucide-react";
import { type RefertoClinico } from "@/lib/store";

const ESITO_STYLE: Record<string, string> = {
  "Positivo": "bg-red-100 text-red-700",
  "In miglioramento": "bg-yellow-100 text-yellow-700",
  "Negativo": "bg-green-100 text-green-700",
};

interface Props {
  atletaId: string;
  refertiClinici?: RefertoClinico[];
  onVaiADati?: () => void;
}

export default function CartellaClinaca({ refertiClinici = [], onVaiADati }: Props) {
  const refertiOrdinati = [...refertiClinici].sort((a, b) => b.data.localeCompare(a.data));

  if (refertiOrdinati.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic text-center py-4">Nessun referto registrato</p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Referti clinici</p>
        {onVaiADati && (
          <button onClick={onVaiADati} className="text-[10px] text-[#C8102E] font-medium hover:underline">
            Gestisci →
          </button>
        )}
      </div>
      <div className="space-y-2">
        {refertiOrdinati.map((r) => (
          <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3 flex items-start gap-3">
            <ClipboardList className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-xs font-semibold text-gray-800">{r.tipo}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ESITO_STYLE[r.esito] ?? "bg-gray-100 text-gray-600"}`}>
                  {r.esito}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(r.data + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
              {r.note && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
