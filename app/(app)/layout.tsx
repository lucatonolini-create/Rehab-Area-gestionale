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
      {/* iOS standalone PWA gap-filler: outerH - innerH = safeTop (47px).
          position:fixed bottom:0 = CSS y=797, leaving physical y=797→844 uncovered.
          bottom:-47px gets clipped by WKWebView. Instead: place at y=(797-47)→797
          then shift via GPU transform to y=797→844 (bypasses viewport clip). */}
      <div
        className="fixed md:hidden"
        style={{
          left: 0,
          right: 0,
          bottom: 0,
          height: "env(safe-area-inset-top, 0px)",
          background: "#ffffff",
          zIndex: 49,
          transform: "translateY(env(safe-area-inset-top, 0px))",
          willChange: "transform",
        }}
      />
      <DiagPanel />
    </BottomNavProvider>
  );
}
