"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, TrendingUp, Dumbbell, Settings,
  BarChart2, LogOut, HeartPulse, Link2, Activity, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getIntakeBadgeCount, resetIntakeBadge } from "@/components/IntakeNotifier";

const navItems = [
  { href: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { href: "/atleti",       label: "Atleti",        icon: Users },
  { href: "/esercizi",     label: "Programmi",     icon: Dumbbell },
  { href: "/progressi",    label: "Progressi",     icon: TrendingUp },
  { href: "/analisi",      label: "Analisi",       icon: BarChart2 },
  { href: "/performance",  label: "Performance",   icon: Activity },
  { href: "/epidemiologia",label: "Epidemiologia", icon: HeartPulse },
  { href: "/ntli",         label: "NTLI",          icon: ShieldAlert },
  { href: "/segnalazioni", label: "Link",          icon: Link2 },
  { href: "/impostazioni", label: "Impostazioni",  icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [intakeBadge, setIntakeBadge] = useState(0);
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);

  useEffect(() => {
    setIntakeBadge(getIntakeBadgeCount());
    const handler = (e: Event) => setIntakeBadge((e as CustomEvent<number>).detail);
    window.addEventListener("intake-badge-update", handler);
    return () => window.removeEventListener("intake-badge-update", handler);
  }, []);

  useEffect(() => {
    if (pathname === "/segnalazioni") resetIntakeBadge();
  }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const showTooltip = (e: React.MouseEvent, label: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, y: rect.top + rect.height / 2 });
  };

  return (
    <>
      <style>{`
        .sb-pill::-webkit-scrollbar { display: none }
        @keyframes sb-label-in {
          from { opacity: 0; transform: translateY(-50%) translateX(-6px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
      `}</style>

      <div
        className="fixed hidden md:flex flex-col z-50"
        style={{
          left: 16,
          top: 16,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          width: 66,
          borderRadius: 33,
          background: "rgba(210,210,210,0.88)",
          backdropFilter: "blur(20px) saturate(1.4)",
          WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        }}
      >
        <nav
          className="sb-pill flex-1 flex flex-col items-center overflow-y-auto py-2"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href;
            const showBadge = href === "/segnalazioni" && intakeBadge > 0;
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-center flex-shrink-0 active:opacity-50 transition-opacity"
                style={{ width: 66, height: 52 }}
                onMouseEnter={(e) => { if (!isActive) showTooltip(e, label); }}
                onMouseLeave={() => setTooltip(null)}
              >
                <div
                  className="relative flex items-center justify-center transition-all duration-200"
                  style={{
                    width: 50,
                    height: 44,
                    borderRadius: 22,
                    background: isActive ? "rgba(200,16,46,0.12)" : "transparent",
                  }}
                >
                  <Icon
                    className={`w-[22px] h-[22px] ${isActive ? "text-[#C8102E] stroke-[2.2px]" : "text-black stroke-[1.5px] opacity-40"}`}
                  />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#C8102E] rounded-full" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="flex-shrink-0 h-px mx-4 bg-black/10" />

        <button
          onClick={handleLogout}
          className="flex-shrink-0 flex items-center justify-center active:opacity-50 transition-opacity"
          style={{ width: 66, height: 52 }}
          onMouseEnter={(e) => showTooltip(e, "Esci")}
          onMouseLeave={() => setTooltip(null)}
        >
          <LogOut className="w-[22px] h-[22px] text-red-400 stroke-[1.5px]" />
        </button>
      </div>

      {/* Floating label tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-[49] hidden md:flex items-center"
          style={{
            left: 58,
            top: tooltip.y,
            transform: "translateY(-50%)",
            background: "rgba(213,213,213,0.97)",
            color: "rgba(0,0,0,0.72)",
            paddingLeft: 30,
            paddingRight: 18,
            height: 44,
            borderRadius: 22,
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            animation: "sb-label-in 0.15s ease-out forwards",
          }}
        >
          {tooltip.label}
        </div>
      )}
    </>
  );
}
