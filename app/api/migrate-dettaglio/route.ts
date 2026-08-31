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

const CREATE_TABLE_SQL = `-- Crea la tabella dettaglio_situazionale
create table if not exists dettaglio_situazionale (
  id                        text primary key,
  atleta_id                 text references atleti(id) on delete cascade,
  fonte_informazione        text[],
  fonte_informazione_altro  text,
  giorni_referto            integer,
  modalita_insorgenza       text,
  modalita_insorgenza_altro text,
  contatto_dettaglio        text,
  situazione_duello         text,
  direzione_contrasto       text,
  collisione_con            text,
  duello_aereo              boolean,
  attivita_fisica           text,
  tipo_corsa                text,
  corsa_gradi               text,
  corsa_gamba_coinvolta     text,
  salto_fase                text,
  salto_atterraggio_dove    text,
  salto_gamba_atterraggio   text,
  caduta_dettagli           text,
  azione_con_palla          boolean,
  situazione_gioco_palla    text,
  attivita_con_palla        text,
  calcio_azione             text,
  calcio_intensita          text,
  calcio_tipo               text,
  calcio_fase               text,
  dribbling_tipo            text,
  palla_altezza             text,
  controllo_palla_con       text,
  gamba_infortunata_palla   text,
  tipo_seduta               text,
  tipo_esercitazione        text,
  partita_sede              text,
  partita_competizione      text,
  partita_punteggio         text,
  fase_gioco                text,
  sotto_fase_gioco          text,
  terreno_gioco             text,
  decisione_arbitrale       text,
  minuto_infortunio         integer,
  minuti_giocati_prima      integer,
  created_at                timestamptz default now()
);

alter table dettaglio_situazionale enable row level security;

create policy "Solo autenticati dettaglio_situazionale"
  on dettaglio_situazionale for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);`;

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

  const { error } = await sb.from("dettaglio_situazionale").select("id").limit(0);
  const tableExists = !error;
  const errorCode = error?.code ?? null;

  return NextResponse.json({ tableExists, errorCode, sql: tableExists ? null : CREATE_TABLE_SQL });
}
