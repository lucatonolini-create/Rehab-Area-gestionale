import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import IntakeNotifier from "@/components/IntakeNotifier";
import PushSetup from "@/components/PushSetup";
import SyncManager from "@/components/SyncManager";
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
        <SyncManager />
      </div>
      <BottomNav />
    </BottomNavProvider>
  );
}
