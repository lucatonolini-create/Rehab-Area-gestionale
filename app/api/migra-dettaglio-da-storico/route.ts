/**
 * Migra dettaglioSituazionale da storico_infortuni → tabella dettaglio_situazionale.
 * Legge ogni athlete, trova l'infortunio più recente con dettaglioSituazionale,
 * e lo copia nella tabella dedicata.
 * Sicuro da rieseguire: usa upsert per atleta_id.
 */
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

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function GET(req: NextRequest) {
  if (!await getAuthUser()) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "Env vars mancanti" }, { status: 503 });

  const sb = createClient(url, key);

  // Check table exists
  const { error: tabErr } = await sb.from("dettaglio_situazionale").select("id").limit(0);
  if (tabErr) {
    return NextResponse.json({ error: "Tabella dettaglio_situazionale non esiste ancora. Creala prima con /api/migrate-dettaglio.", tabErrCode: tabErr.code });
  }

  // Load all athletes
  const { data: atleti, error: atErr } = await sb.from("atleti").select("id, nome, stato, storico_infortuni");
  if (atErr) return NextResponse.json({ error: atErr.message });

  const migrati: { nome: string; fonte: string }[] = [];
  const saltati: { nome: string; motivo: string }[] = [];

  for (const a of (atleti ?? [])) {
    const storico = (a.storico_infortuni as { id?: string; diagnosi?: string; dettaglioSituazionale?: Record<string, unknown> }[]) ?? [];

    // Find entries with dettaglioSituazionale data (pick the last one = most recent)
    const conDett = storico.filter((i) => i.dettaglioSituazionale && Object.keys(i.dettaglioSituazionale).length > 0);

    if (conDett.length === 0) {
      saltati.push({ nome: a.nome, motivo: "Nessun dettaglio in storico_infortuni" });
      continue;
    }

    // Use the last one with data
    const fonte = conDett[conDett.length - 1];
    const formData = fonte.dettaglioSituazionale as Record<string, unknown>;

    // Check if already exists in dettaglio_situazionale table
    const { data: existing } = await sb.from("dettaglio_situazionale").select("id").eq("atleta_id", a.id).limit(1);
    if (existing && existing.length > 0) {
      saltati.push({ nome: a.nome, motivo: "Già presente nella tabella" });
      continue;
    }

    // Map DettaglioSituazionaleForm (snake_case) → dettaglio_situazionale table row
    const row: Record<string, unknown> = {
      id: uid(),
      atleta_id: a.id,
      fonte_informazione: formData.fonte_informazione ?? null,
      fonte_informazione_altro: formData.fonte_informazione_altro ?? null,
      giorni_referto: formData.giorni_referto ? parseInt(String(formData.giorni_referto)) || null : null,
      modalita_insorgenza: formData.modalita_insorgenza ?? null,
      modalita_insorgenza_altro: formData.modalita_insorgenza_altro ?? null,
      contatto_dettaglio: formData.contatto_dettaglio ?? null,
      situazione_duello: formData.situazione_duello ?? null,
      direzione_contrasto: formData.direzione_contrasto ?? null,
      collisione_con: formData.collisione_con ?? null,
      duello_aereo: formData.duello_aereo === "si" ? true : formData.duello_aereo === "no" ? false : (formData.duello_aereo ?? null),
      attivita_fisica: formData.attivita_fisica ?? null,
      tipo_corsa: formData.tipo_corsa ?? null,
      corsa_gradi: formData.corsa_gradi ?? null,
      corsa_gamba_coinvolta: formData.corsa_gamba_coinvolta ?? null,
      salto_fase: formData.salto_fase ?? null,
      salto_atterraggio_dove: formData.salto_atterraggio_dove ?? null,
      salto_gamba_atterraggio: formData.salto_gamba_atterraggio ?? null,
      caduta_dettagli: formData.caduta_dettagli ?? null,
      azione_con_palla: typeof formData.azione_con_palla === "boolean" ? formData.azione_con_palla : (formData.azione_con_palla ? true : null),
      situazione_gioco_palla: formData.situazione_gioco_palla ?? null,
      attivita_con_palla: formData.attivita_con_palla ?? null,
      calcio_azione: formData.calcio_azione ?? null,
      calcio_intensita: formData.calcio_intensita ?? null,
      calcio_tipo: formData.calcio_tipo ?? null,
      calcio_fase: formData.calcio_fase ?? null,
      dribbling_tipo: formData.dribbling_tipo ?? null,
      palla_altezza: formData.palla_altezza ?? null,
      controllo_palla_con: formData.controllo_palla_con ?? null,
      gamba_infortunata_palla: formData.gamba_infortunata_palla ?? null,
      tipo_seduta: formData.tipo_seduta ?? null,
      tipo_esercitazione: formData.tipo_esercitazione ?? null,
      partita_sede: formData.partita_sede ?? null,
      partita_competizione: formData.partita_competizione ?? null,
      partita_punteggio: formData.partita_punteggio ?? null,
      fase_gioco: formData.fase_gioco ?? null,
      sotto_fase_gioco: formData.sotto_fase_gioco ?? null,
      terreno_gioco: formData.terreno_gioco ?? null,
      decisione_arbitrale: formData.decisione_arbitrale ?? null,
      minuto_infortunio: formData.minuto_infortunio ? parseInt(String(formData.minuto_infortunio)) || null : null,
      minuti_giocati_prima: formData.minuti_giocati_prima ? parseInt(String(formData.minuti_giocati_prima)) || null : null,
    };

    if (!dry) {
      const { error: insErr } = await sb.from("dettaglio_situazionale").insert(row);
      if (insErr) {
        saltati.push({ nome: a.nome, motivo: `Errore insert: ${insErr.message}` });
        continue;
      }
    }

    migrati.push({ nome: a.nome, fonte: fonte.diagnosi ?? "infortunio" });
  }

  return NextResponse.json({ dry, migrati, saltati, totale: (atleti ?? []).length });
}
