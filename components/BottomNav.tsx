"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Dumbbell, ShieldAlert,
  TrendingUp, BarChart2, Activity, HeartPulse, Link2, Settings, LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getIntakeBadgeCount, resetIntakeBadge } from "@/components/IntakeNotifier";
import { useBottomNav } from "@/lib/bottom-nav-context";

const allTabs = [
  { href: "/",             label: "Dashboard",  icon: LayoutDashboard },
  { href: "/atleti",       label: "Atleti",     icon: Users },
  { href: "/esercizi",     label: "Programmi",  icon: Dumbbell },
  { href: "/ntli",         label: "NTLI",       icon: ShieldAlert },
  { href: "/progressi",    label: "Progressi",  icon: TrendingUp },
  { href: "/analisi",      label: "Analisi",    icon: BarChart2 },
  { href: "/performance",  label: "Perform.",   icon: Activity },
  { href: "/epidemiologia",label: "Epidem.",    icon: HeartPulse },
  { href: "/segnalazioni", label: "Link",       icon: Link2 },
  { href: "/impostazioni", label: "Impost.",    icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [intakeBadge, setIntakeBadge] = useState(0);
  const { hidden } = useBottomNav();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  useEffect(() => {
    setIntakeBadge(getIntakeBadgeCount());
    const handler = (e: Event) => setIntakeBadge((e as CustomEvent<number>).detail);
    window.addEventListener("intake-badge-update", handler);
    return () => window.removeEventListener("intake-badge-update", handler);
  }, []);

  useEffect(() => {
    if (pathname === "/segnalazioni") resetIntakeBadge();
  }, [pathname]);

  if (hidden) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 md:hidden"
      style={{ bottom: 0 }}
    >
      <nav
        className="flex items-center px-3 py-1.5 gap-0.5"
        style={{
          background: "rgba(210,210,215,0.82)",
          backdropFilter: "blur(30px) saturate(2)",
          WebkitBackdropFilter: "blur(30px) saturate(2)",
          borderRadius: "28px 28px 0 0",
          borderTop: "0.5px solid rgba(255,255,255,0.70)",
          borderLeft: "0.5px solid rgba(255,255,255,0.70)",
          borderRight: "0.5px solid rgba(255,255,255,0.70)",
          boxShadow: "0 -2px 20px rgba(0,0,0,0.10)",
          overflowX: "auto",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <style>{`nav::-webkit-scrollbar { display: none; }`}</style>
        {allTabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          const showBadge = href === "/segnalazioni" && intakeBadge > 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-[3px] px-3.5 py-2 rounded-full transition-all flex-shrink-0 ${
                isActive ? "" : "active:bg-black/10"
              }`}
              style={isActive ? { backgroundColor: "#C8102E" } : {}}
            >
              <div className="relative">
                <Icon
                  className={`w-[21px] h-[21px] ${isActive ? "text-white stroke-[2.2px]" : "text-gray-600 stroke-[1.8px]"}`}
                />
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#C8102E] rounded-full border border-white/60" />
                )}
              </div>
              <span className={`text-[10px] leading-none whitespace-nowrap ${isActive ? "text-white font-semibold" : "text-gray-600 font-medium"}`}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* Divisore sottile */}
        <div className="flex-shrink-0 w-px h-6 bg-black/15 mx-1" />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-[3px] px-3.5 py-2 rounded-full transition-all flex-shrink-0 active:bg-red-500/15"
        >
          <LogOut className="w-[21px] h-[21px] text-red-500 stroke-[1.8px]" />
          <span className="text-[10px] leading-none whitespace-nowrap text-red-500 font-medium">Esci</span>
        </button>
      </nav>
    </div>
  );
}
