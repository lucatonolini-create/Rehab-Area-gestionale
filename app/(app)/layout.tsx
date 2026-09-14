import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import IntakeNotifier from "@/components/IntakeNotifier";
import PushSetup from "@/components/PushSetup";
import SessionTimeout from "@/components/SessionTimeout";
import { BottomNavProvider } from "@/lib/bottom-nav-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <BottomNavProvider>
      <div
        className="flex overflow-hidden bg-white"
        style={{ position: "fixed", inset: 0 }}
      >
        <Sidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
        <OfflineBanner />
        <IntakeNotifier />
        <PushSetup />
        <SessionTimeout />
        {/* Fade gradient from screen bottom upward — content scrolls behind nav */}
        <div
          className="fixed left-0 right-0 pointer-events-none md:hidden"
          style={{
            bottom: 0,
            height: "calc(env(safe-area-inset-bottom, 0px) + 70px)",
            background: "linear-gradient(to top, white 30%, rgba(255,255,255,0) 100%)",
            zIndex: 49,
          }}
        />
        <BottomNav />
      </div>
    </BottomNavProvider>
  );
}
