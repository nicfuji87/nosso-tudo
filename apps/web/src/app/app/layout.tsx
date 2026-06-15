import { getAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, workspace, plan, isOwner, isPlatformAdmin } = await getAdminContext();

  const supabase = createClient();
  const { count } = await supabase
    .from("v_inbox_revisao")
    .select("item_id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id);

  return (
    <AppShell
      profile={profile}
      workspace={workspace}
      plan={plan}
      isAdmin={isOwner || isPlatformAdmin}
      inboxCount={count ?? 0}
    >
      {children}
    </AppShell>
  );
}
