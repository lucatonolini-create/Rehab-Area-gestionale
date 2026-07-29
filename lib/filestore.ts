"use client";

import { supabase } from "./supabase";

const BUCKET = "documenti-medici";

export async function uploadRefertoToSupabase(
  atletaId: string,
  refertoId: string,
  file: File
): Promise<{ url: string; nome: string } | null> {
  try {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${atletaId}/${refertoId}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) { console.error("[uploadReferto]", error.message); return null; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, nome: file.name };
  } catch (e) { console.error("[uploadReferto] exception", e); return null; }
}

export async function deleteRefertoFromSupabase(url: string): Promise<void> {
  try {
    // Extract storage path from public URL: …/storage/v1/object/public/<bucket>/<path>
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const storagePath = url.slice(idx + marker.length);
    await supabase.storage.from(BUCKET).remove([storagePath]);
  } catch {}
}

export interface DocMedico {
  id: string;
  atletaId: string;
  nome: string;
  mimeType: string;
  dataCaricamento: string;
  dimensione: number;
  blob: Blob;
}

const DB_NAME = "usc_rehab_files";
const STORE = "documenti";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function salvaDoc(doc: DocMedico): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function caricaDocs(atletaId: string): Promise<DocMedico[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve((req.result as DocMedico[]).filter((d) => d.atletaId === atletaId));
    req.onerror = () => reject(req.error);
  });
}

export async function caricaDoc(id: string): Promise<DocMedico | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as DocMedico) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function eliminaDoc(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
