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
        <BottomNav />
      </div>
    </BottomNavProvider>
  );
}
