"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, TrendingUp, Dumbbell, Settings, ChevronLeft, BarChart2, LogOut, HeartPulse, Link2, Activity, ShieldAlert, Menu, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getIntakeBadgeCount, resetIntakeBadge } from "@/components/IntakeNotifier";

function AppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="400" height="400" rx="90" fill="#3a3d42"/>
      <g transform="translate(60,60) scale(11.6667)" stroke="#f2efe9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M14.4 14.4 9.6 9.6"/>
        <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/>
        <path d="m21.5 21.5-1.4-1.4"/>
        <path d="M3.9 3.9 2.5 2.5"/>
        <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>
      </g>
    </svg>
  );
}

const navItems = [
  { href: "/",             label: "Dashboard",   icon: LayoutDashboard },
  { href: "/atleti",       label: "Atleti",       icon: Users },
  { href: "/esercizi",     label: "Programmi",    icon: Dumbbell },
  { href: "/progressi",    label: "Progressi",    icon: TrendingUp },
  { href: "/analisi",      label: "Analisi",      icon: BarChart2   },
  { href: "/performance",  label: "Performance",  icon: Activity    },
  { href: "/epidemiologia",label: "Epidemiologia",icon: HeartPulse  },
  { href: "/ntli",         label: "NTLI",         icon: ShieldAlert },
  { href: "/segnalazioni", label: "Link",         icon: Link2      },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

const RED = "#C8102E";

function SidebarContent({
  collapsed,
  setCollapsed,
  pathname,
  intakeBadge,
  userEmail,
  handleLogout,
  onNavClick,
}: {
  collapsed: boolean;
  setCollapsed?: (v: boolean) => void;
  pathname: string;
  intakeBadge: number;
  userEmail: string | null;
  handleLogout: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div
        className={`border-b border-black/8 flex items-center shrink-0 ${collapsed ? "p-3 justify-center" : "p-5 justify-between"}`}
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + ${collapsed ? "0.75rem" : "1.25rem"})` }}
      >
        {!collapsed && (
          <div className="flex items-center gap-3">
            <AppLogo className="w-10 h-10 rounded-xl shrink-0" />
            <div>
              <h1 className="font-bold text-sm text-gray-900 leading-tight">Rehab Area</h1>
            </div>
          </div>
        )}
        {setCollapsed && (
          collapsed ? (
            <button onClick={() => setCollapsed(false)} className="text-gray-500 hover:text-gray-900" title="Espandi menu">
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={() => setCollapsed(true)} className="text-gray-500 hover:text-gray-900 ml-2" title="Nascondi menu">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )
        )}
        {onNavClick && !setCollapsed && (
          <button onClick={onNavClick} className="text-gray-500 hover:text-gray-900 ml-auto">
            <X className="w-5 h-5" />
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
              onClick={onNavClick}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-xl transition-all duration-150 text-sm font-medium relative ${
                collapsed ? "justify-center p-3" : "gap-3 px-4 py-3"
              } ${isActive ? "text-[#C8102E] bg-[#C8102E]/10" : "text-gray-600 hover:text-gray-900 hover:bg-black/5"}`}>
              {isActive && !collapsed && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[#C8102E] rounded-r" />
              )}
              <div className="relative shrink-0">
                <Icon className="w-5 h-5" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#C8102E] rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5 border border-[#B8B8B8]">
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
      <div
        className={`border-t border-black/8 shrink-0 ${collapsed ? "p-2 flex justify-center" : "p-4"}`}
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${collapsed ? "0.5rem" : "1rem"})` }}
      >
        {collapsed ? (
          <button onClick={handleLogout} title="Esci" className="text-gray-500 hover:text-gray-900 transition-colors p-1">
            <LogOut className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ backgroundColor: RED }}>
              {userEmail ? userEmail[0].toUpperCase() : "S"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userEmail ?? "Staff Medico"}</p>
            </div>
            <button onClick={handleLogout} title="Esci" className="text-gray-500 hover:text-gray-900 transition-colors shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [intakeBadge, setIntakeBadge] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

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

  const sidebarStyle = {
    background: "linear-gradient(to right, rgba(248,248,248,0.98) 0%, rgba(245,245,245,0.92) 70%, rgba(240,240,240,0.60) 100%)",
    backdropFilter: "blur(40px) saturate(1.4)",
    WebkitBackdropFilter: "blur(40px) saturate(1.4)",
  };

  return (
    <aside
      style={sidebarStyle}
      className={`hidden md:flex flex-col text-gray-800 shrink-0 transition-all duration-300 ease-in-out ${collapsed ? "w-16" : "w-64"}`}
    >
      <SidebarContent
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        pathname={pathname}
        intakeBadge={intakeBadge}
        userEmail={userEmail}
        handleLogout={handleLogout}
      />
    </aside>
  );
}
