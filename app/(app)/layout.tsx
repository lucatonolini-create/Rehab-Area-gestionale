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
className="flex bg-[#F5F5F7]"
        style={{ position: "fixed", inset: 0 }}
      >
        <Sidebar />
        <main className="flex-1 overflow-hidden md:pl-[98px]" style={{ minHeight: 0, height: "100%" }}>{children}</main>
        <OfflineBanner />
        <IntakeNotifier />
        <PushSetup />
        <SessionTimeout />
      </div>
      <BottomNav />
      {/* Top fade — solo i primissimi pixel dove il contenuto sfila sotto la barra status */}
      <div
        className="fixed md:hidden pointer-events-none"
        style={{
          left: 0,
          right: 0,
          top: 0,
          height: 24,
          background: "linear-gradient(to bottom, rgba(245,245,247,1) 0%, rgba(245,245,247,0) 100%)",
          zIndex: 45,
        }}
      />
    </BottomNavProvider>
  );
}
