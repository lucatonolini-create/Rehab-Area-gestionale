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
  const [scrollVisible, setScrollVisible] = useState(true);
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

  // Auto-hide on scroll down, show on scroll up
  useEffect(() => {
    let lastY = 0;

    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement;
      const y = el.scrollTop ?? 0;

      if (y <= 0) {
        setScrollVisible(true);
        lastY = 0;
        return;
      }
      if (y > lastY + 6) {
        setScrollVisible(false);
      } else if (y < lastY - 6) {
        setScrollVisible(true);
      }
      lastY = y;
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
  }, []);

  useEffect(() => {
    setScrollVisible(true);
  }, [pathname]);

  const visible = scrollVisible && !hidden;
  const slideOut = visible ? "translateY(0)" : "translateY(120px)";
  const transition = "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <>
      {/* Floating pill nav — Instagram style */}
      <div
        className="fixed z-50 md:hidden"
        style={{
          left: 16,
          right: 16,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)",
          borderRadius: 40,
          background: "rgba(180,180,180,0.38)",
          backdropFilter: "blur(36px) saturate(1.8)",
          WebkitBackdropFilter: "blur(36px) saturate(1.8)",
          border: "none",
          boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
          transform: slideOut,
          transition,
          willChange: "transform",
        }}
      >
        <nav
          className="flex items-center px-1"
          style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", height: 66 } as React.CSSProperties}
        >
          <style>{`nav::-webkit-scrollbar{display:none}`}</style>
          {allTabs.map(({ href, icon: Icon }) => {
            const isActive = pathname === href;
            const showBadge = href === "/segnalazioni" && intakeBadge > 0;
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-center flex-shrink-0 active:opacity-50 transition-opacity"
                style={{ flex: "0 0 20%", height: 66 }}
              >
                <div
                  className="relative flex items-center justify-center transition-all duration-200"
                  style={{
                    width: 62,
                    height: 54,
                    borderRadius: 27,
                    background: isActive ? "rgba(200,16,46,0.12)" : "transparent",
                  }}
                >
                  <Icon
                    className={`w-[26px] h-[26px] ${isActive ? "text-[#C8102E] stroke-[2.2px]" : "text-black stroke-[1.5px] opacity-40"}`}
                  />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#C8102E] rounded-full" />
                  )}
                </div>
              </Link>
            );
          })}

          <div className="flex-shrink-0 w-px h-5 bg-black/10" />

          <button
            onClick={handleLogout}
            className="flex items-center justify-center flex-shrink-0 active:opacity-50 transition-opacity"
            style={{ flex: "0 0 20%", height: 66 }}
          >
            <div
              className="flex items-center justify-center"
              style={{ width: 48, height: 36, borderRadius: 18 }}
            >
              <LogOut className="w-[26px] h-[26px] text-red-400 stroke-[1.5px]" />
            </div>
          </button>
        </nav>
      </div>
    </>
  );
}
