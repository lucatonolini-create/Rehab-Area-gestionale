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
      {/* Tap outside to close */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)} />
      )}

      {/* Popup menu — floating above the "..." button */}
      {moreOpen && (
        <div
          className="fixed z-50 md:hidden"
          style={{
            bottom: "calc(66px + env(safe-area-inset-bottom, 0px))",
            right: "12px",
            minWidth: "220px",
            background: "rgba(235,235,240,0.93)",
            backdropFilter: "blur(40px) saturate(2)",
            WebkitBackdropFilter: "blur(40px) saturate(2)",
            borderRadius: "16px",
            border: "0.5px solid rgba(255,255,255,0.6)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          {moreTabs.map(({ href, label, icon: Icon }, i) => {
            const isActive = pathname === href;
            const showBadge = href === "/segnalazioni" && intakeBadge > 0;
            return (
              <div key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    isActive ? "text-[#C8102E]" : "text-gray-800 active:bg-black/5"
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {showBadge && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#C8102E] rounded-full" />
                    )}
                  </div>
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {showBadge && (
                    <span className="bg-[#C8102E] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {intakeBadge > 9 ? "9+" : intakeBadge}
                    </span>
                  )}
                </Link>
                {i < moreTabs.length - 1 && (
                  <div className="h-px bg-black/8 mx-4" />
                )}
              </div>
            );
          })}
          <div className="h-px bg-black/10" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 active:bg-black/5 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Esci</span>
          </button>
        </div>
      )}

      {/* Safe area cover — white so it blends with app background */}
      <div
        className="fixed left-0 right-0 z-49 md:hidden"
        style={{
          bottom: 0,
          height: "env(safe-area-inset-bottom, 0px)",
          background: "white",
        }}
      />

      {/* Floating pill tab bar — light glassmorphism */}
      <div
        className="fixed left-0 right-0 z-50 md:hidden flex justify-center"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) - 4px)",
        }}
      >
        <nav
          className="flex items-center px-1.5 py-1.5 gap-0.5"
          style={{
            background: "rgba(210,210,215,0.78)",
            backdropFilter: "blur(30px) saturate(2)",
            WebkitBackdropFilter: "blur(30px) saturate(2)",
            borderRadius: "40px",
            border: "0.5px solid rgba(255,255,255,0.65)",
            boxShadow: "0 2px 20px rgba(0,0,0,0.14)",
          }}
        >
          {mainTabs.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-[3px] px-3.5 py-2 rounded-full transition-all ${
                  isActive ? "" : "active:bg-black/10"
                }`}
                style={isActive ? { backgroundColor: "#C8102E" } : {}}
              >
                <Icon
                  className={`w-[21px] h-[21px] ${isActive ? "text-white stroke-[2.2px]" : "text-gray-600 stroke-[1.8px]"}`}
                />
                <span className={`text-[10px] leading-none ${isActive ? "text-white font-semibold" : "text-gray-600 font-medium"}`}>
                  {label}
                </span>
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex flex-col items-center justify-center gap-[3px] px-3.5 py-2 rounded-full transition-all ${
              moreOpen || isMoreActive ? "" : "active:bg-black/10"
            }`}
            style={(moreOpen || isMoreActive) ? { backgroundColor: "#C8102E" } : {}}
          >
            <div className="relative">
              <MoreHorizontal
                className={`w-[21px] h-[21px] ${(moreOpen || isMoreActive) ? "text-white stroke-[2.2px]" : "text-gray-600 stroke-[1.8px]"}`}
              />
              {!moreOpen && intakeBadge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#C8102E] rounded-full border border-white/60" />
              )}
            </div>
            <span className={`text-[10px] leading-none ${(moreOpen || isMoreActive) ? "text-white font-semibold" : "text-gray-600 font-medium"}`}>
              Altro
            </span>
          </button>
        </nav>
      </div>
    </>
  );
}
