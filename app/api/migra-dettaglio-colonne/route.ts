/**
 * Restituisce l'SQL di migrazione da eseguire nel Supabase Dashboard → SQL Editor.
 * Visita /api/migra-dettaglio-colonne per ottenere l'SQL.
 */
import { NextResponse } from "next/server";

const MIGRATION_SQL = `
ALTER TABLE dettaglio_situazionale
  ADD COLUMN IF NOT EXISTS fonte_informazione        text[],
  ADD COLUMN IF NOT EXISTS fonte_informazione_altro  text,
  ADD COLUMN IF NOT EXISTS giorni_referto            integer,
  ADD COLUMN IF NOT EXISTS modalita_insorgenza       text,
  ADD COLUMN IF NOT EXISTS modalita_insorgenza_altro text,
  ADD COLUMN IF NOT EXISTS contatto_dettaglio        text,
  ADD COLUMN IF NOT EXISTS situazione_duello         text,
  ADD COLUMN IF NOT EXISTS direzione_contrasto       text,
  ADD COLUMN IF NOT EXISTS collisione_con            text,
  ADD COLUMN IF NOT EXISTS duello_aereo              boolean,
  ADD COLUMN IF NOT EXISTS attivita_fisica           text,
  ADD COLUMN IF NOT EXISTS tipo_corsa                text,
  ADD COLUMN IF NOT EXISTS corsa_gradi               text,
  ADD COLUMN IF NOT EXISTS corsa_gamba_coinvolta     text,
  ADD COLUMN IF NOT EXISTS salto_fase                text,
  ADD COLUMN IF NOT EXISTS salto_atterraggio_dove    text,
  ADD COLUMN IF NOT EXISTS salto_gamba_atterraggio   text,
  ADD COLUMN IF NOT EXISTS caduta_dettagli           text,
  ADD COLUMN IF NOT EXISTS azione_con_palla          boolean,
  ADD COLUMN IF NOT EXISTS situazione_gioco_palla    text,
  ADD COLUMN IF NOT EXISTS attivita_con_palla        text,
  ADD COLUMN IF NOT EXISTS calcio_azione             text,
  ADD COLUMN IF NOT EXISTS calcio_intensita          text,
  ADD COLUMN IF NOT EXISTS calcio_tipo               text,
  ADD COLUMN IF NOT EXISTS calcio_fase               text,
  ADD COLUMN IF NOT EXISTS dribbling_tipo            text,
  ADD COLUMN IF NOT EXISTS palla_altezza             text,
  ADD COLUMN IF NOT EXISTS controllo_palla_con       text,
  ADD COLUMN IF NOT EXISTS gamba_infortunata_palla   text,
  ADD COLUMN IF NOT EXISTS tipo_seduta               text,
  ADD COLUMN IF NOT EXISTS tipo_esercitazione        text,
  ADD COLUMN IF NOT EXISTS partita_sede              text,
  ADD COLUMN IF NOT EXISTS partita_competizione      text,
  ADD COLUMN IF NOT EXISTS partita_punteggio         text,
  ADD COLUMN IF NOT EXISTS fase_gioco                text,
  ADD COLUMN IF NOT EXISTS sotto_fase_gioco          text,
  ADD COLUMN IF NOT EXISTS terreno_gioco             text,
  ADD COLUMN IF NOT EXISTS decisione_arbitrale       text,
  ADD COLUMN IF NOT EXISTS minuto_infortunio         integer,
  ADD COLUMN IF NOT EXISTS minuti_giocati_prima      integer,
  ADD COLUMN IF NOT EXISTS created_at               timestamptz default now();
`.trim();

export async function GET() {
  return NextResponse.json({
    istruzioni: "Copia il campo 'sql' qui sotto e incollalo nel Supabase Dashboard → SQL Editor → New query → Run",
    sql: MIGRATION_SQL,
  });
}
