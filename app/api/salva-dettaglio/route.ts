import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, key);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON non valido" }, { status: 400 });
  }

  const atletaId = body.atleta_id as string | undefined;
  if (!atletaId) return NextResponse.json({ ok: false, error: "atleta_id mancante" }, { status: 400 });

  // Cerca eventuale riga esistente per questo atleta
  const { data: rows, error: selErr } = await sb
    .from("dettaglio_situazionale")
    .select("id")
    .eq("atleta_id", atletaId)
    .limit(10);

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message });

  // Rimuovi duplicati se presenti
  if (rows && rows.length > 1) {
    const toDelete = rows.slice(1).map((r: { id: string }) => r.id);
    await sb.from("dettaglio_situazionale").delete().in("id", toDelete);
  }

  // Usa l'id esistente se c'è, altrimenti quello passato nel body
  const id = rows?.[0]?.id ?? body.id;
  const row = { ...body, id };

  const { error: upsErr } = await sb.from("dettaglio_situazionale").upsert(row);
  if (upsErr) return NextResponse.json({ ok: false, error: upsErr.message });

  return NextResponse.json({ ok: true, id });
}
