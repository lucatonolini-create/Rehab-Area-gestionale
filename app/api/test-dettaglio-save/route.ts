/**
 * Endpoint di diagnostica: tenta di scrivere una riga di test in dettaglio_situazionale
 * e restituisce il risultato esatto (successo o errore Supabase).
 * Visita /api/test-dettaglio-save da browser autenticato.
 */
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
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Test 1: con la chiave anon (come fa il browser)
  const sbAnon = createClient(url, anonKey);
  const testId = "test-diag-" + Date.now();
  const { error: anonErr } = await sbAnon.from("dettaglio_situazionale").insert({
    id: testId,
    atleta_id: null, // null per non vincolare atleti reali
    modalita_insorgenza: "TEST",
  });

  // Test 2: con la service role key (bypassa RLS)
  let serviceResult: { ok: boolean; error?: string } = { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY non configurata" };
  if (serviceKey) {
    const sbService = createClient(url, serviceKey);
    const { error: svcErr } = await sbService.from("dettaglio_situazionale").insert({
      id: testId + "-svc",
      atleta_id: null,
      modalita_insorgenza: "TEST-SVC",
    });
    serviceResult = svcErr ? { ok: false, error: svcErr.message } : { ok: true };
    // Pulizia
    if (!svcErr) await sbService.from("dettaglio_situazionale").delete().like("id", "test-diag-%");
  }

  return NextResponse.json({
    user_id: user.id,
    user_email: user.email,
    test_anon_key: anonErr ? { ok: false, error: anonErr.message, code: anonErr.code } : { ok: true },
    test_service_key: serviceResult,
    note: "Se test_anon_key.ok=false e code=42501, è un problema RLS. Se ok=true, il salvataggio DB funziona.",
  });
}
