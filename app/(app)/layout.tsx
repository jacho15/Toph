import Sidebar from "@/components/Sidebar";
import { signOut } from "@/app/actions/auth";
import { getDashboardStats, getViewer } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [viewer, stats] = await Promise.all([getViewer(), getDashboardStats()]);

  return (
    <div className="flex h-screen items-stretch gap-[10px] overflow-hidden bg-paper p-[10px]">
      <Sidebar viewer={viewer} newCount={stats.todays_new} logoutAction={signOut} />
      <main className="flex min-w-0 flex-1 flex-col gap-[10px] overflow-y-auto px-[30px] py-0">{children}</main>
    </div>
  );
}
