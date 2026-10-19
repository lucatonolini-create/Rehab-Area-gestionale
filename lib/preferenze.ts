import { supabase } from "@/lib/supabase";

/** Legge da localStorage (fast) poi sovrascrive con Supabase. */
export async function getPreferenza<T>(chiave: string, fallback: T): Promise<T> {
  let local: T = fallback;
  try {
    const raw = localStorage.getItem(chiave);
    if (raw) local = JSON.parse(raw) as T;
  } catch {}
  try {
    const { data } = await supabase
      .from("preferenze_app")
      .select("valore")
      .eq("chiave", chiave)
      .single();
    if (data?.valore !== undefined && data.valore !== null) {
      const remote = data.valore as T;
      try { localStorage.setItem(chiave, JSON.stringify(remote)); } catch {}
      return remote;
    }
  } catch {}
  return local;
}

/** Legge solo da localStorage (sincrono, per inizializzazione stato). */
export function getPreferenzaLocal<T>(chiave: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(chiave);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

/** Scrive su localStorage E Supabase. */
export async function setPreferenza<T>(chiave: string, valore: T): Promise<void> {
  try { localStorage.setItem(chiave, JSON.stringify(valore)); } catch {}
  try {
    await supabase
      .from("preferenze_app")
      .upsert({ chiave, valore }, { onConflict: "chiave" });
  } catch {}
}

/** Versione fire-and-forget per i punti dove non serve await. */
export function setPreferenzaSync<T>(chiave: string, valore: T): void {
  setPreferenza(chiave, valore).catch(() => {});
}
