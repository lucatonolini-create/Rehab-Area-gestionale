import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import IntakeNotifier from "@/components/IntakeNotifier";
import PushSetup from "@/components/PushSetup";
import SessionTimeout from "@/components/SessionTimeout";
import { BottomNavProvider } from "@/lib/bottom-nav-context";
import DiagPanel from "@/components/DiagPanel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <BottomNavProvider>
      <div
        data-diag="appshell"
        className="flex bg-white"
        style={{ position: "fixed", inset: 0 }}
      >
        <Sidebar />
        <main className="flex-1 overflow-hidden" style={{ minHeight: 0, height: "100%" }}>{children}</main>
        <OfflineBanner />
        <IntakeNotifier />
        <PushSetup />
        <SessionTimeout />
      </div>
      <BottomNav />
      {/* iOS standalone PWA: outerH - innerH = safeTop (47px). CSS bottom:0 = innerH,
          leaving a physical gap below. This filler extends into that gap. */}
      <div
        className="fixed md:hidden"
        style={{
          left: 0,
          right: 0,
          bottom: "calc(-1 * env(safe-area-inset-top, 0px))",
          height: "env(safe-area-inset-top, 0px)",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          zIndex: 49,
        }}
      />
      <DiagPanel />
    </BottomNavProvider>
  );
}
