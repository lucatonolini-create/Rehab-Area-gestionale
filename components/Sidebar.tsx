"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, TrendingUp, Settings, Menu, X, ChevronLeft, BarChart2, LogOut, HeartPulse, Link2, Activity,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getIntakeBadgeCount, resetIntakeBadge } from "@/components/IntakeNotifier";

function AppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="400" height="400" rx="90" fill="#3a3d42"/>
      <rect x="95"  y="248" width="52" height="82"  rx="12" fill="#f2efe9"/>
      <rect x="174" y="180" width="52" height="150" rx="12" fill="#f2efe9"/>
      <rect x="253" y="96"  width="52" height="234" rx="12" fill="#9c3b3b"/>
      <rect x="269" y="120" width="20" height="60" rx="5" fill="#f2efe9"/>
      <rect x="249" y="140" width="60" height="20" rx="5" fill="#f2efe9"/>
    </svg>
  );
}

const navItems = [
  { href: "/",             label: "Dashboard",   icon: LayoutDashboard },
  { href: "/atleti",       label: "Atleti",       icon: Users },
  { href: "/esercizi",     label: "Programmi",    icon: AppLogo },
  { href: "/progressi",    label: "Progressi",    icon: TrendingUp },
  { href: "/analisi",        label: "Analisi",        icon: BarChart2   },
  { href: "/performance",   label: "Performance",   icon: Activity    },
  { href: "/epidemiologia", label: "Epidemiologia", icon: HeartPulse  },
  { href: "/segnalazioni", label: "Link",           icon: Link2      },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

const RED  = "#C8102E";
const DARK = "#2B2B2B";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileAperta, setMobileAperta] = useState(false);
  const [collapsed, setCollapsed]       = useState(false);
  const [intakeBadge, setIntakeBadge]   = useState(0);
  const [userEmail, setUserEmail]       = useState<string | null>(null);

  useEffect(() => { setMobileAperta(false); }, [pathname]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  // Badge intake: leggi da localStorage e ascolta aggiornamenti in tempo reale
  useEffect(() => {
    setIntakeBadge(getIntakeBadgeCount());
    const handler = (e: Event) => setIntakeBadge((e as CustomEvent<number>).detail);
    window.addEventListener("intake-badge-update", handler);
    return () => window.removeEventListener("intake-badge-update", handler);
  }, []);

  // Quando l'utente apre la pagina Link, azzera il badge
  useEffect(() => {
    if (pathname === "/segnalazioni") resetIntakeBadge();
  }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      {/* Overlay mobile */}
      {mobileAperta && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileAperta(false)} />
      )}

      {/* Bottone hamburger — mobile, quando sidebar è chiusa */}
      {!mobileAperta && (
        <button onClick={() => setMobileAperta(true)}
          className="fixed left-4 z-50 md:hidden text-white p-2.5 rounded-xl shadow-lg"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)", backgroundColor: RED }}>
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        style={{ backgroundColor: DARK }}
        className={`
          flex flex-col shadow-2xl text-white shrink-0
          transition-all duration-300 ease-in-out
          fixed left-0 z-40
          md:static md:translate-x-0
          top-0 bottom-0
          ${mobileAperta ? "translate-x-0 w-64" : "-translate-x-full w-64"}
          ${collapsed ? "md:w-16" : "md:w-64"}
        `}
      >
        {/* Header */}
        <div className={`border-b border-white/10 flex items-center shrink-0 ${collapsed ? "p-3 justify-center" : "p-5 justify-between"}`}>
          {!collapsed && (
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 rounded-xl shrink-0">
                <rect width="400" height="400" rx="90" fill="#3a3d42"/>
                <rect x="95"  y="248" width="52" height="82"  rx="12" fill="#f2efe9"/>
                <rect x="174" y="180" width="52" height="150" rx="12" fill="#f2efe9"/>
                <rect x="253" y="96"  width="52" height="234" rx="12" fill="#9c3b3b"/>
                <rect x="269" y="120" width="20" height="60" rx="5" fill="#f2efe9"/>
                <rect x="249" y="140" width="60" height="20" rx="5" fill="#f2efe9"/>
              </svg>
              <div>
                <h1 className="font-bold text-sm text-white leading-tight">Rehab Area</h1>
              </div>
            </div>
          )}

          {/* Chiudi su mobile */}
          {mobileAperta && !collapsed && (
            <button onClick={() => setMobileAperta(false)} className="md:hidden text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Toggle collapse su desktop */}
          {collapsed ? (
            <button onClick={() => setCollapsed(false)} className="hidden md:flex text-white/60 hover:text-white" title="Espandi menu">
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={() => setCollapsed(true)} className="hidden md:flex text-white/60 hover:text-white ml-2" title="Nascondi menu">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto space-y-1 ${collapsed ? "p-2" : "p-4"}`}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            const showBadge = href === "/segnalazioni" && intakeBadge > 0;
            return (
              <Link key={href} href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center rounded-xl transition-all duration-150 text-sm font-medium ${
                  collapsed ? "justify-center p-3" : "gap-3 px-4 py-3"
                } ${isActive ? "text-white" : "text-white/65 hover:text-white hover:bg-white/10"}`}
                style={isActive ? { backgroundColor: RED } : {}}>
                <div className="relative shrink-0">
                  <Icon className="w-5 h-5" />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#C8102E] rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5 border border-[#2B2B2B]">
                      {intakeBadge > 9 ? "9+" : intakeBadge}
                    </span>
                  )}
                </div>
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && showBadge && (
                  <span className="ml-auto bg-[#C8102E] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {intakeBadge > 9 ? "9+" : intakeBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/10 shrink-0 ${collapsed ? "p-2 flex justify-center" : "p-4"}`}>
          {collapsed ? (
            <button onClick={handleLogout} title="Esci" className="text-white/40 hover:text-white transition-colors p-1">
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: RED }}>
                {userEmail ? userEmail[0].toUpperCase() : "S"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{userEmail ?? "Staff Medico"}</p>
                <p className="text-white/40 text-xs">Rehab Area</p>
              </div>
              <button onClick={handleLogout} title="Esci" className="text-white/40 hover:text-white transition-colors shrink-0">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
