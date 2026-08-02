import { NextResponse } from "next/server";
import { perfGetAthletes } from "@/lib/performance-api";
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

/**
 * GET /api/migrate-names
 * Migrazione one-shot: sostituisce le sigle con il nome completo nel campo `nome`.
 * Per atleti con sigla → match by code da Performance → nome = athlete.name
 * Per atleti con nome già proprio (no punti) → lascia nome invariato, sincronizza nome_completo
 * Sicuro da richiamare più volte (non sovrascrive chi ha già il nome completo).
 */
export async function GET() {
  if (!await getAuthUser()) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase env vars mancanti" }, { status: 503 });
    }
    const sb = createClient(url, key);

    // 1. Sostituisce la sigla (nome con punti) con il nome completo da Performance
    const perfAthletes: { name: string; code?: string }[] = await perfGetAthletes();

    const fromPerformance: { code: string; name: string; updated: number; error?: string }[] = [];
    for (const a of perfAthletes) {
      if (!a.code || !a.name) continue;
      const { data: rows, error } = await sb
        .from("atleti")
        .update({ nome: a.name, nome_completo: null })
        .eq("nome", a.code)          // match by sigla
        .select("id");
      fromPerformance.push({
        code: a.code,
        name: a.name,
        updated: rows?.length ?? 0,
        ...(error ? { error: error.message } : {}),
      });
    }

    // 2. Atleti il cui nome_completo è valorizzato ma nome è ancora una sigla (con punti)
    //    → porta nome_completo in nome e svuota nome_completo
    const { data: withNomeCompleto } = await sb
      .from("atleti")
      .select("id, nome, nome_completo")
      .not("nome_completo", "is", null)
      .like("nome", "%.%");           // ancora una sigla

    const fromNomeCompleto: string[] = [];
    for (const row of withNomeCompleto ?? []) {
      const { error } = await sb
        .from("atleti")
        .update({ nome: row.nome_completo, nome_completo: null })
        .eq("id", row.id);
      if (!error) fromNomeCompleto.push(row.nome_completo);
    }

    const totale = fromPerformance.reduce((s, r) => s + r.updated, 0) + fromNomeCompleto.length;
    return NextResponse.json({ ok: true, fromPerformance, fromNomeCompleto, totaleAggiornati: totale });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
