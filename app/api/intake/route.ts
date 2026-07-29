import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const CATEGORIE_VALIDE = ["1ª Squadra", "U19", "U17", "U16", "U15", "U14", "Altra squadra", "Provino"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notificaEBroadcast(
  supabase: ReturnType<typeof createClient<any>>,
  nome: string,
  categoria: string,
  atletaId: string,
) {
  // Aggiungi alla rosa se non già presente
  try {
    const { data: imp } = await supabase
      .from("impostazioni")
      .select("rosa")
      .eq("id", 1)
      .single();
    const rosaAttuale: { nome: string; categoria: string; ruolo: string }[] = (imp as any)?.rosa ?? [];
    const giàPresente = rosaAttuale.some((g) => g.nome.toLowerCase() === nome.toLowerCase());
    if (!giàPresente) {
      await (supabase.from("impostazioni") as any).upsert({
        id: 1,
        rosa: [...rosaAttuale, { nome, categoria, ruolo: "" }],
      });
    }
  } catch {}

  // Broadcast via Realtime REST
  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: "intake-notify",
          event: "new",
          payload: { nome, categoria, id: atletaId },
        }],
      }),
    },
  ).catch(() => {});

  // Web Push
  if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    webpush.setVapidDetails(
      "mailto:rehab@uscremonese.it",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    const { data: subs } = await (supabase.from("push_subscriptions") as any).select("endpoint, keys") as { data: { endpoint: string; keys: { p256dh: string; auth: string } }[] | null };
    if (subs?.length) {
      const payload = JSON.stringify({
        title: "Nuovo infortunio segnalato",
        body: `${nome} · ${categoria}`,
        url: "/segnalazioni",
      });
      await Promise.allSettled(
        subs.map((s) =>
          webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload)
        )
      );
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.nome?.trim()) {
      return NextResponse.json({ error: "Nome richiesto" }, { status: 400 });
    }
    if (!CATEGORIE_VALIDE.includes(body.categoria)) {
      return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const oggi = new Date().toISOString().slice(0, 10);
    const nomeNorm = body.nome.trim();

    // ── Cerca atleta esistente con lo stesso nome (case-insensitive) ──────────
    const { data: esistenti } = await supabase
      .from("atleti")
      .select("*")
      .ilike("nome", nomeNorm)
      .limit(1);

    const esistente = esistenti?.[0];

    if (esistente) {
      const nuoviDati = {
        tipo_infortunio: body.tipoInfortunio ?? null,
        evento: body.evento ?? null,
        meccanismo: body.meccanismo ?? null,
        contatto: body.contatto ?? null,
        lato: body.lato ?? null,
        posizione_infortunio: body.posizioneInfortunio ?? null,
        infortunio: body.infortunio ?? "",
        osiics_code_id: body.osiicsCodeId || null,
        osiics_codice: body.osiicsCodice || null,
        osiics_descrizione: body.osiicsDescrizione || null,
        inizio_rehab: body.inizioRehab || oggi,
        note: body.note || esistente.note || "",
      };

      if (esistente.stato === "Disponibile") {
        // Re-infortunio: sposta il vecchio infortunio nello storico e rimette Infortunato
        const vecchioInf = {
          id: crypto.randomUUID(),
          diagnosi: esistente.infortunio || "—",
          tipo: esistente.tipo_infortunio || undefined,
          inizioRehab: esistente.inizio_rehab || "",
          fineRehab: esistente.fine_rehab || oggi,
          note: esistente.note || undefined,
          evento: esistente.evento || undefined,
          meccanismo: esistente.meccanismo || undefined,
          contatto: esistente.contatto || undefined,
          lato: esistente.lato || undefined,
          posizioneInfortunio: esistente.posizione_infortunio || undefined,
        };
        const storicoEsistente: unknown[] = esistente.storico_infortuni ?? [];
        const { error } = await supabase.from("atleti").update({
          ...nuoviDati,
          stato: "Infortunato",
          fine_rehab: null,
          progresso: 0,
          progresso_manuale: null,
          storico_infortuni: [...storicoEsistente, vecchioInf],
        }).eq("id", esistente.id);
        if (error) {
          console.error("[intake PATCH disponibile]", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await notificaEBroadcast(supabase, nomeNorm, body.categoria, esistente.id);
        return NextResponse.json({ ok: true, id: esistente.id });
      }

      if (esistente.stato === "Infortunato") {
        // Infortunio concorrente: aggiunge allo storico con attivo:true
        const storicoEsistente: unknown[] = esistente.storico_infortuni ?? [];
        const nuovoConcorrente = {
          id: crypto.randomUUID(),
          diagnosi: body.infortunio || "—",
          tipo: body.tipoInfortunio || undefined,
          inizioRehab: body.inizioRehab || oggi,
          fineRehab: "",
          note: body.note || undefined,
          attivo: true,
          evento: body.evento || undefined,
          meccanismo: body.meccanismo || undefined,
          contatto: body.contatto || undefined,
          lato: body.lato || undefined,
          posizioneInfortunio: body.posizioneInfortunio || undefined,
        };
        const { error } = await supabase.from("atleti").update({
          storico_infortuni: [...storicoEsistente, nuovoConcorrente],
        }).eq("id", esistente.id);
        if (error) {
          console.error("[intake PATCH concorrente]", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await notificaEBroadcast(supabase, nomeNorm, body.categoria, esistente.id);
        return NextResponse.json({ ok: true, id: esistente.id });
      }
    }

    // ── Atleta non trovato: crea nuovo record ─────────────────────────────────
    const row = {
      id: crypto.randomUUID(),
      nome: nomeNorm,
      categoria: body.categoria,
      posizione: body.posizione ?? "",
      piede_dominante: body.piedeDominante ?? "",
      tipo_infortunio: body.tipoInfortunio ?? null,
      evento: body.evento ?? null,
      meccanismo: body.meccanismo ?? null,
      contatto: body.contatto ?? null,
      lato: body.lato ?? null,
      posizione_infortunio: body.posizioneInfortunio ?? null,
      infortunio: body.infortunio ?? "",
      osiics_code_id: body.osiicsCodeId || null,
      osiics_codice: body.osiicsCodice || null,
      osiics_descrizione: body.osiicsDescrizione || null,
      inizio_rehab: body.inizioRehab || oggi,
      fine_rehab: null,
      stato: "Infortunato",
      progresso: 0,
      fisioterapista: body.fisioterapista ?? "",
      preparatore_atletico: "",
      telefono: "__intake__",
      email: "",
      note: body.note ?? "",
      storico_infortuni: [],
      questionari_kinesiofobia: [],
      referti_clinici: [],
      progresso_manuale: null,
      peso: body.peso ?? null,
      altezza: body.altezza ?? null,
      nome_completo: null,
    };

    const { error } = await supabase.from("atleti").insert(row);
    if (error) {
      console.error("[intake POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Salva dettaglio situazionale FIICCS se presente
    if (body.dettaglio && typeof body.dettaglio === "object") {
      const det = body.dettaglio;
      const hasData = !!(
        det.fonte_informazione?.length || det.giorni_referto || det.modalita_insorgenza ||
        det.attivita_fisica || det.tipo_seduta || det.azione_con_palla
      );
      if (hasData) {
        const detRow = {
          id: crypto.randomUUID(),
          atleta_id: row.id,
          fonte_informazione: det.fonte_informazione?.length ? det.fonte_informazione : null,
          fonte_informazione_altro: det.fonte_informazione_altro || null,
          giorni_referto: det.giorni_referto ? parseInt(det.giorni_referto) || null : null,
          modalita_insorgenza: det.modalita_insorgenza || null,
          modalita_insorgenza_altro: det.modalita_insorgenza_altro || null,
          contatto_dettaglio: det.contatto_dettaglio || null,
          situazione_duello: det.situazione_duello || null,
          direzione_contrasto: det.direzione_contrasto || null,
          collisione_con: det.collisione_con || null,
          duello_aereo: det.duello_aereo || null,
          attivita_fisica: det.attivita_fisica || null,
          tipo_corsa: det.tipo_corsa || null,
          corsa_gradi: det.corsa_gradi || null,
          corsa_gamba_coinvolta: det.corsa_gamba_coinvolta || null,
          salto_fase: det.salto_fase || null,
          salto_atterraggio_dove: det.salto_atterraggio_dove || null,
          salto_gamba_atterraggio: det.salto_gamba_atterraggio || null,
          caduta_dettagli: det.caduta_dettagli || null,
          azione_con_palla: !!det.azione_con_palla,
          situazione_gioco_palla: det.situazione_gioco_palla || null,
          attivita_con_palla: det.attivita_con_palla || null,
          calcio_azione: det.calcio_azione || null,
          calcio_intensita: det.calcio_intensita || null,
          calcio_tipo: det.calcio_tipo || null,
          calcio_fase: det.calcio_fase || null,
          dribbling_tipo: det.dribbling_tipo || null,
          palla_altezza: det.palla_altezza || null,
          controllo_palla_con: det.controllo_palla_con || null,
          gamba_infortunata_palla: det.gamba_infortunata_palla || null,
          tipo_seduta: det.tipo_seduta || null,
          tipo_esercitazione: det.tipo_esercitazione || null,
          partita_sede: det.partita_sede || null,
          partita_competizione: det.partita_competizione || null,
          partita_punteggio: det.partita_punteggio || null,
          fase_gioco: det.fase_gioco || null,
          sotto_fase_gioco: det.sotto_fase_gioco || null,
          terreno_gioco: det.terreno_gioco || null,
          decisione_arbitrale: det.decisione_arbitrale || null,
          minuto_infortunio: det.minuto_infortunio ? parseInt(det.minuto_infortunio) || null : null,
          minuti_giocati_prima: det.minuti_giocati_prima ? parseInt(det.minuti_giocati_prima) || null : null,
        };
        await supabase.from("dettaglio_situazionale").insert(detRow);
      }
    }

    await notificaEBroadcast(supabase, row.nome, row.categoria, row.id);

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
