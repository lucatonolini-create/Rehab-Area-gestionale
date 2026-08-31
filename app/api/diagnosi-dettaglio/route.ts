import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getAuthUser() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export async function GET() {
  if (!await getAuthUser()) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "Env vars mancanti" }, { status: 503 });

  const sb = createClient(url, key);

  // Check dettaglio_situazionale table
  const { data: tabRows, error: tabErr } = await sb.from("dettaglio_situazionale").select("atleta_id").limit(100);
  const tableExists = !tabErr;
  const tableRows = tabRows?.length ?? 0;

  // Check storico_infortuni for embedded dettaglioSituazionale
  const { data: atleti, error: atErr } = await sb
    .from("atleti")
    .select("id, nome, stato, storico_infortuni")
    .in("stato", ["Infortunato", "NTL"]);

  if (atErr) return NextResponse.json({ error: atErr.message });

  const conDatiNelloStorico: { id: string; nome: string; stato: string; infortuni: { id: string; diagnosi: string; hasDett: boolean }[] }[] = [];

  for (const a of (atleti ?? [])) {
    const storico = (a.storico_infortuni as { id: string; diagnosi?: string; dettaglioSituazionale?: Record<string, unknown> }[]) ?? [];
    const infortuni = storico.map((inf) => ({
      id: inf.id,
      diagnosi: inf.diagnosi ?? "—",
      hasDett: !!(inf.dettaglioSituazionale && Object.keys(inf.dettaglioSituazionale).length > 0),
    }));
    const hasAny = infortuni.some((i) => i.hasDett);
    if (hasAny) {
      conDatiNelloStorico.push({ id: a.id, nome: a.nome, stato: a.stato, infortuni });
    }
  }

  return NextResponse.json({
    tableExists,
    tableRows,
    tabErr: tabErr?.message ?? null,
    atleti: atleti?.length ?? 0,
    conDatiNelloStorico,
  });
}
