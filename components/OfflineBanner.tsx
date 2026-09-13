"use client";

import { useEffect, useRef, useState } from "react";
import { syncFlush } from "@/lib/store";
import { WifiOff, RefreshCw, Wifi } from "lucide-react";

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  // Only show sync banner if the user was actually offline at some point
  const wasOffline = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const goOnline = async () => {
      setOnline(true);
      if (!wasOffline.current) return; // ignore spurious online events on app launch
      wasOffline.current = false;
      setSyncing(true);
      await syncFlush();
      setSyncing(false);
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2500);
    };

    const goOffline = () => {
      setOnline(false);
      setJustSynced(false);
      wasOffline.current = true;
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        syncFlush().catch(() => {});
      }
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);

    if (navigator.onLine) syncFlush().catch(() => {});

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (online && !syncing && !justSynced) return null;

  return (
    <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg text-white transition-all ${
      !online ? "bg-orange-500" : syncing ? "bg-blue-600" : "bg-green-600"
    }`}>
      {!online ? (
        <>
          <WifiOff className="w-4 h-4" />
          Offline — modifiche salvate in locale
        </>
      ) : syncing ? (
        <>
          <RefreshCw className="w-4 h-4 animate-spin" />
          Sincronizzazione in corso…
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4" />
          Sincronizzato
        </>
      )}
    </div>
  );
}
