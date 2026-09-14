"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Dumbbell, ShieldAlert, MoreHorizontal,
  TrendingUp, BarChart2, Activity, HeartPulse, Link2, Settings, LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getIntakeBadgeCount, resetIntakeBadge } from "@/components/IntakeNotifier";

const mainTabs = [
  { href: "/",         label: "Dashboard", icon: LayoutDashboard },
  { href: "/atleti",   label: "Atleti",    icon: Users },
  { href: "/esercizi", label: "Programmi", icon: Dumbbell },
  { href: "/ntli",     label: "NTLI",      icon: ShieldAlert },
];

const moreTabs = [
  { href: "/progressi",     label: "Progressi",    icon: TrendingUp },
  { href: "/analisi",       label: "Analisi",       icon: BarChart2 },
  { href: "/performance",   label: "Performance",   icon: Activity },
  { href: "/epidemiologia", label: "Epidemiologia", icon: HeartPulse },
  { href: "/segnalazioni",  label: "Link",          icon: Link2 },
  { href: "/impostazioni",  label: "Impostazioni",  icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [intakeBadge, setIntakeBadge] = useState(0);

  useEffect(() => {
    setIntakeBadge(getIntakeBadgeCount());
    const handler = (e: Event) => setIntakeBadge((e as CustomEvent<number>).detail);
    window.addEventListener("intake-badge-update", handler);
    return () => window.removeEventListener("intake-badge-update", handler);
  }, []);

  useEffect(() => {
    if (pathname === "/segnalazioni") resetIntakeBadge();
    setMoreOpen(false);
  }, [pathname]);

  const isMoreActive = moreTabs.some(t => t.href === pathname);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      {/* Overlay backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backdropFilter: "blur(4px) brightness(0.9)", WebkitBackdropFilter: "blur(4px) brightness(0.9)", backgroundColor: "rgba(0,0,0,0.15)" }}
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* "Altro" sheet */}
      {moreOpen && (
        <div
          className="fixed left-0 right-0 z-50 rounded-t-2xl shadow-xl md:hidden"
          style={{
            bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(250,250,250,0.97)",
            backdropFilter: "blur(30px) saturate(1.8)",
            WebkitBackdropFilter: "blur(30px) saturate(1.8)",
          }}
        >
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-1 bg-gray-300 rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-1 p-3">
            {moreTabs.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              const showBadge = href === "/segnalazioni" && intakeBadge > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                    isActive ? "bg-[#C8102E]/10 text-[#C8102E]" : "text-gray-600 active:bg-gray-100"
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-6 h-6" />
                    {showBadge && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#C8102E] rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                        {intakeBadge > 9 ? "9+" : intakeBadge}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">{label}</span>
                </Link>
              );
            })}
          </div>
          <div className="border-t border-gray-100 mx-4 pt-2 pb-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 active:bg-gray-100 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Esci</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          background: "rgba(255,255,255,0.93)",
          backdropFilter: "blur(20px) saturate(1.8)",
          WebkitBackdropFilter: "blur(20px) saturate(1.8)",
          borderTop: "0.5px solid rgba(0,0,0,0.12)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex h-[60px]">
          {mainTabs.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-[3px] transition-colors ${
                  isActive ? "text-[#C8102E]" : "text-gray-400"
                }`}
              >
                <Icon className={`w-[22px] h-[22px] ${isActive ? "stroke-[2.2px]" : "stroke-[1.8px]"}`} />
                <span className={`text-[10px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-[3px] transition-colors ${
              moreOpen || isMoreActive ? "text-[#C8102E]" : "text-gray-400"
            }`}
          >
            <div className="relative">
              <MoreHorizontal className={`w-[22px] h-[22px] ${(moreOpen || isMoreActive) ? "stroke-[2.2px]" : "stroke-[1.8px]"}`} />
              {!moreOpen && intakeBadge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#C8102E] rounded-full" />
              )}
            </div>
            <span className={`text-[10px] leading-none ${(moreOpen || isMoreActive) ? "font-semibold" : "font-medium"}`}>Altro</span>
          </button>
        </div>
      </nav>
    </>
  );
}
