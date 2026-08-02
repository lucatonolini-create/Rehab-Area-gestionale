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

const COLONNE_ATLETI: { nome: string; tipo: string; default?: string }[] = [
  { nome: "referti_clinici", tipo: "jsonb", default: "'[]'::jsonb" },
  { nome: "progresso_manuale", tipo: "float4" },
  { nome: "peso", tipo: "text" },
  { nome: "altezza", tipo: "text" },
  { nome: "nome_completo", tipo: "text" },
];

const COLONNE_PROGRAMMI: { nome: string; tipo: string }[] = [
  { nome: "nome", tipo: "text" },
  { nome: "fase", tipo: "text" },
  { nome: "data", tipo: "text" },
  { nome: "esercizi", tipo: "jsonb" },
  { nome: "tests", tipo: "jsonb" },
  { nome: "carico", tipo: "jsonb" },
];

export async function GET() {
  if (!await getAuthUser()) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase env vars mancanti" }, { status: 503 });
  }
  const sb = createClient(url, key);

  const mancantiAtleti: string[] = [];
  for (const col of COLONNE_ATLETI) {
    const { error } = await sb.from("atleti").select(col.nome).limit(0);
    if (error?.code === "42703") mancantiAtleti.push(col.nome);
  }

  const mancantiProgrammi: string[] = [];
  for (const col of COLONNE_PROGRAMMI) {
    const { error } = await sb.from("programmi").select(col.nome).limit(0);
    if (error?.code === "42703") mancantiProgrammi.push(col.nome);
  }

  // Also try a test upsert with a dummy record to detect RLS or other errors
  const { error: rlsTest } = await sb.from("programmi").select("id").limit(1);
  const programmiAccessible = !rlsTest;
  const rlsError = rlsTest ? `${rlsTest.code}: ${rlsTest.message}` : null;

  const sqlAtleti = COLONNE_ATLETI
    .filter((c) => mancantiAtleti.includes(c.nome))
    .map((c) => `ALTER TABLE atleti ADD COLUMN IF NOT EXISTS ${c.nome} ${c.tipo}${c.default ? ` DEFAULT ${c.default}` : ""};`)
    .join("\n");

  const sqlProgrammi = COLONNE_PROGRAMMI
    .filter((c) => mancantiProgrammi.includes(c.nome))
    .map((c) => `ALTER TABLE programmi ADD COLUMN IF NOT EXISTS ${c.nome} ${c.tipo};`)
    .join("\n");

  const sql = [sqlAtleti, sqlProgrammi].filter(Boolean).join("\n") || null;
  const mancanti = [...mancantiAtleti.map(c => `atleti.${c}`), ...mancantiProgrammi.map(c => `programmi.${c}`)];

  return NextResponse.json({
    mancanti,
    sql,
    ok: mancanti.length === 0,
    programmiAccessible,
    rlsError,
  });
}
