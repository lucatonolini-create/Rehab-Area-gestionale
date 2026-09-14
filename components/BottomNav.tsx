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
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        padding: "0 10px",
      }}
    >
      <nav
        className="flex items-center"
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderRadius: 22,
          boxShadow: "0 2px 24px rgba(0,0,0,0.13), 0 0 0 0.5px rgba(0,0,0,0.07)",
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
              className="flex flex-col items-center justify-center gap-[2px] px-2 py-2 flex-1 flex-shrink-0 min-w-[52px] active:opacity-60 transition-opacity"
            >
              <div
                className="relative flex items-center justify-center rounded-full transition-all duration-200"
                style={{
                  width: 48,
                  height: 28,
                  background: isActive ? "rgba(200,16,46,0.10)" : "transparent",
                }}
              >
                <Icon
                  className={`w-[20px] h-[20px] ${isActive ? "text-[#C8102E] stroke-[2.2px]" : "text-gray-500 stroke-[1.7px]"}`}
                />
                {showBadge && (
                  <span className="absolute top-0 right-1 w-2 h-2 bg-[#C8102E] rounded-full" />
                )}
              </div>
              <span className={`text-[10px] leading-none whitespace-nowrap ${isActive ? "text-[#C8102E] font-semibold" : "text-gray-500 font-normal"}`}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* Divisore sottile */}
        <div className="flex-shrink-0 w-px h-5 bg-black/10" />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-[3px] px-3 py-2.5 flex-shrink-0 min-w-[48px] active:opacity-60 transition-opacity"
        >
          <LogOut className="w-[22px] h-[22px] text-red-400 stroke-[1.7px]" />
          <span className="text-[10px] leading-none whitespace-nowrap text-red-400 font-normal">Esci</span>
        </button>
      </nav>
    </div>
  );
}
