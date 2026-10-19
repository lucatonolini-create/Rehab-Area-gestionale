"use client";

import { useEffect, useRef } from "react";
import { syncFlush } from "@/lib/store";

// Fires "app-sync" on the window so any page can reload fresh data from Supabase.
// Triggered when the device comes back online or the tab becomes visible after >30s.
export default function SyncManager() {
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const doSync = async () => {
      await syncFlush().catch(() => {});
      window.dispatchEvent(new CustomEvent("app-sync"));
    };

    const handleOnline = () => { doSync(); };

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
      } else {
        const hiddenMs = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
        hiddenAt.current = null;
        if (hiddenMs > 30_000) doSync();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
