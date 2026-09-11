import Sidebar from "@/components/Sidebar";
import OfflineBanner from "@/components/OfflineBanner";
import IntakeNotifier from "@/components/IntakeNotifier";
import PushSetup from "@/components/PushSetup";
import SessionTimeout from "@/components/SessionTimeout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex overflow-hidden bg-white"
      style={{ position: "fixed", inset: 0 }}
    >
      <Sidebar />
      <main className="flex-1 overflow-y-auto app-main">{children}</main>
      <OfflineBanner />
      <IntakeNotifier />
      <PushSetup />
      <SessionTimeout />
    </div>
  );
}
