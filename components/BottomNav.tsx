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
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* "Altro" sheet */}
      {moreOpen && (
        <div
          className="fixed left-4 right-4 z-50 rounded-2xl shadow-2xl md:hidden overflow-hidden"
          style={{
            bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(30,30,32,0.97)",
            backdropFilter: "blur(30px) saturate(1.8)",
            WebkitBackdropFilter: "blur(30px) saturate(1.8)",
          }}
        >
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-1 bg-white/20 rounded-full" />
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
                    isActive ? "bg-white/20 text-white" : "text-white/60 active:bg-white/10"
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
          <div className="border-t border-white/10 mx-4 pt-2 pb-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 active:bg-white/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Esci</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating pill tab bar */}
      <div
        className="fixed left-0 right-0 z-50 md:hidden flex justify-center"
        style={{
          bottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <nav
          className="flex items-center px-2 py-1.5 gap-1"
          style={{
            background: "rgba(28,28,30,0.95)",
            backdropFilter: "blur(20px) saturate(1.8)",
            WebkitBackdropFilter: "blur(20px) saturate(1.8)",
            borderRadius: "40px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
          }}
        >
          {mainTabs.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-[3px] px-4 py-2 rounded-full transition-all ${
                  isActive ? "bg-white/20" : "active:bg-white/10"
                }`}
              >
                <Icon
                  className={`w-[22px] h-[22px] ${isActive ? "text-white stroke-[2.2px]" : "text-white/55 stroke-[1.8px]"}`}
                />
                <span className={`text-[10px] leading-none ${isActive ? "text-white font-semibold" : "text-white/55 font-medium"}`}>
                  {label}
                </span>
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex flex-col items-center justify-center gap-[3px] px-4 py-2 rounded-full transition-all ${
              moreOpen || isMoreActive ? "bg-white/20" : "active:bg-white/10"
            }`}
          >
            <div className="relative">
              <MoreHorizontal
                className={`w-[22px] h-[22px] ${(moreOpen || isMoreActive) ? "text-white stroke-[2.2px]" : "text-white/55 stroke-[1.8px]"}`}
              />
              {!moreOpen && intakeBadge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#C8102E] rounded-full" />
              )}
            </div>
            <span className={`text-[10px] leading-none ${(moreOpen || isMoreActive) ? "text-white font-semibold" : "text-white/55 font-medium"}`}>
              Altro
            </span>
          </button>
        </nav>
      </div>
    </>
  );
}
