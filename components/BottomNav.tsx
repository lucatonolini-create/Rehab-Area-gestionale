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

  // Auto-hide on scroll down, show on scroll up — Instagram style
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
        setScrollVisible(false); // scrolling down → hide
      } else if (y < lastY - 6) {
        setScrollVisible(true);  // scrolling up → show
      }
      lastY = y;
    };

    // capture:true catches scroll events on any child element (they don't bubble)
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
  }, []);

  // Reset scroll visibility whenever the route changes
  useEffect(() => {
    setScrollVisible(true);
  }, [pathname]);

  const visible = scrollVisible && !hidden;

  return (
    <>
      {/* Permanent safe-area backdrop — always covers the iOS home indicator zone even when nav is hidden */}
      <div
        className="fixed z-[49] md:hidden"
        style={{
          left: 0,
          right: 0,
          bottom: 0,
          height: "env(safe-area-inset-bottom, 0px)",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        }}
      />
      <div
        className="fixed z-50 md:hidden"
        style={{
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderTop: "0.5px solid rgba(0,0,0,0.10)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          transform: visible ? "translateY(0)" : "translateY(110%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "transform",
        }}
      >
      <nav
        className="flex items-center"
        style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <style>{`nav::-webkit-scrollbar{display:none}`}</style>
        {allTabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          const showBadge = href === "/segnalazioni" && intakeBadge > 0;
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-[2px] px-2 py-2 flex-shrink-0 active:opacity-60 transition-opacity"
              style={{ flex: "0 0 20%" }}
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

        <div className="flex-shrink-0 w-px h-5 bg-black/10" />

        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-[3px] py-2.5 flex-shrink-0 active:opacity-60 transition-opacity"
          style={{ flex: "0 0 20%" }}
        >
          <LogOut className="w-[22px] h-[22px] text-red-400 stroke-[1.7px]" />
          <span className="text-[10px] leading-none whitespace-nowrap text-red-400 font-normal">Esci</span>
        </button>
      </nav>
    </div>
    </>
  );
}

