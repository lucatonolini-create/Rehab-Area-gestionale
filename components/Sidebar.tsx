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

function getScale(hoveredIdx: number | null, thisIdx: number): number {
  if (hoveredIdx === null) return 1;
  const dist = Math.abs(hoveredIdx - thisIdx);
  if (dist === 0) return 1.45;
  if (dist === 1) return 1.18;
  if (dist === 2) return 1.06;
  return 1;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [intakeBadge, setIntakeBadge] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
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

  const onEnter = (e: React.MouseEvent, idx: number, label: string, isActive: boolean) => {
    setHoveredIdx(idx);
    if (!isActive) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({ label, y: rect.top + rect.height / 2 });
    }
  };

  const onLeave = () => {
    setHoveredIdx(null);
    setTooltip(null);
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
          overflow: "visible",
        }}
      >
        <nav
          className="sb-pill flex-1 flex flex-col items-center overflow-y-auto py-2"
          style={{ scrollbarWidth: "none", overflow: "visible" } as React.CSSProperties}
        >
          {navItems.map(({ href, icon: Icon, label }, idx) => {
            const isActive = pathname === href;
            const showBadge = href === "/segnalazioni" && intakeBadge > 0;
            const scale = getScale(hoveredIdx, idx);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 66, height: 52 }}
                onMouseEnter={(e) => onEnter(e, idx, label, isActive)}
                onMouseLeave={onLeave}
              >
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    width: 50,
                    height: 44,
                    borderRadius: 22,
                    background: isActive ? "rgba(200,16,46,0.12)" : "transparent",
                    transform: `scale(${scale})`,
                    transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
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
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 66, height: 52 }}
          onMouseEnter={(e) => {
            setHoveredIdx(navItems.length);
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltip({ label: "Esci", y: rect.top + rect.height / 2 });
          }}
          onMouseLeave={onLeave}
        >
          <div
            style={{
              transform: `scale(${hoveredIdx === navItems.length ? 1.45 : 1})`,
              transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            <LogOut className="w-[22px] h-[22px] text-red-400 stroke-[1.5px]" />
          </div>
        </button>
      </div>

      {/* Tooltip staccato */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-[60] hidden md:flex items-center"
          style={{
            left: 92,
            top: tooltip.y,
            transform: "translateY(-50%)",
            background: "rgba(210,210,210,0.88)",
            backdropFilter: "blur(20px) saturate(1.4)",
            WebkitBackdropFilter: "blur(20px) saturate(1.4)",
            color: "rgba(0,0,0,0.75)",
            padding: "0 14px",
            height: 34,
            borderRadius: 17,
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
