"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minuti

export default function SessionTimeout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login");
      }, TIMEOUT_MS);
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router]);

  return null;
}
