import Sidebar from "@/components/Sidebar";
import OfflineBanner from "@/components/OfflineBanner";
import IntakeNotifier from "@/components/IntakeNotifier";
import PushSetup from "@/components/PushSetup";
import SessionTimeout from "@/components/SessionTimeout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex overflow-hidden bg-white"
      style={{ height: "100dvh" }}
    >
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
      <OfflineBanner />
      <IntakeNotifier />
      <PushSetup />
      <SessionTimeout />
    </div>
  );
}
