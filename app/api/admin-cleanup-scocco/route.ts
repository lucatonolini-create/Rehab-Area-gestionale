import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-8)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Trova Scocco Lionel
  const { data: atleti } = await supabase
    .from("atleti")
    .select("id, nome, storico_infortuni")
    .ilike("nome", "%scocco%");

  if (!atleti?.length) return NextResponse.json({ error: "Scocco non trovato" });
  const scocco = atleti[0];

  // Trova l'infortunio Onicocriptosi nello storico
  const storico: { id: string; diagnosi: string; inizioRehab: string; fineRehab: string }[] =
    (scocco.storico_infortuni as any[]) ?? [];
  const onico = storico.find((s) => s.diagnosi?.toLowerCase().includes("onicoc"));

  // Recupera tutti i programmi di Scocco
  const { data: programmi } = await supabase
    .from("programmi")
    .select("id, data, nome, infortunio_id")
    .eq("atleta_id", scocco.id);

  if (!programmi?.length) return NextResponse.json({ scoccoId: scocco.id, message: "Nessun programma trovato" });

  // Tieni solo i programmi nel range dell'Onicocriptosi o con infortunioId corrispondente
  const inizioOnico = onico?.inizioRehab ?? null;
  const fineOnico = onico?.fineRehab ?? null;
  const idOnico = onico?.id ?? null;

  const daEliminare = programmi.filter((p) => {
    if (idOnico && (p as any).infortunio_id === idOnico) return false; // è dell'infortunio giusto
    if (inizioOnico && fineOnico && p.data) {
      if (p.data >= inizioOnico && p.data <= fineOnico) return false; // nel range
    }
    return true; // elimina
  });

  const daTenere = programmi.filter((p) => !daEliminare.some((d) => d.id === p.id));

  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({
      scoccoId: scocco.id,
      onico: onico ?? null,
      totale: programmi.length,
      daTenere: daTenere.map((p) => ({ id: p.id, data: p.data, nome: p.nome })),
      daEliminare: daEliminare.map((p) => ({ id: p.id, data: p.data, nome: p.nome })),
    });
  }

  // Elimina
  if (daEliminare.length > 0) {
    await supabase.from("programmi").delete().in("id", daEliminare.map((p) => p.id));
  }

  return NextResponse.json({
    ok: true,
    eliminati: daEliminare.length,
    rimasti: daTenere.length,
    eliminatiDettaglio: daEliminare.map((p) => ({ id: p.id, data: p.data, nome: p.nome })),
  });
}
