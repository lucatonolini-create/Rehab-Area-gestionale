/**
 * Restituisce l'SQL di migrazione da eseguire nel Supabase Dashboard → SQL Editor.
 * Visita /api/migra-dettaglio-colonne per ottenere l'SQL.
 */
import { NextResponse } from "next/server";

const MIGRATION_SQL = `
-- Nuova colonna sulla tabella atleti: salva il dettaglio FIICCS come JSONB
ALTER TABLE atleti ADD COLUMN IF NOT EXISTS dettaglio_situazionale jsonb;
`.trim();

export async function GET() {
  return NextResponse.json({
    istruzioni: "Copia il campo 'sql' qui sotto e incollalo nel Supabase Dashboard → SQL Editor → New query → Run",
    sql: MIGRATION_SQL,
  });
}
