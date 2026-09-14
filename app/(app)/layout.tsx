import Sidebar from "@/components/Sidebar";
import OfflineBanner from "@/components/OfflineBanner";
import IntakeNotifier from "@/components/IntakeNotifier";
import PushSetup from "@/components/PushSetup";
import SessionTimeout from "@/components/SessionTimeout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex bg-white"
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: "100dvh" }}
    >
      <Sidebar />
      <main className="flex-1 overflow-hidden" style={{ height: "100dvh" }}>{children}</main>
      <OfflineBanner />
      <IntakeNotifier />
      <PushSetup />
      <SessionTimeout />
    </div>
  );
}
