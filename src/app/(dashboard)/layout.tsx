import { BottomNav, SideNav } from "@/components/app-nav";
import { currentSession } from "@/lib/auth/current";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();

  return (
    <div className="md:flex md:min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-surface px-3 py-5 md:flex md:flex-col md:gap-6 lg:w-60">
        <div className="px-3">
          <p className="text-[17px] font-bold">업무 대시보드</p>
          {session ? <p className="mt-0.5 truncate text-xs text-muted">@{session.login}</p> : null}
        </div>
        <SideNav />
      </aside>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-24 sm:px-6 md:pb-8 lg:px-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
