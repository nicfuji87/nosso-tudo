import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/patterns/page-header";
import { InboxView, type InboxItem } from "@/components/inbox/inbox-view";

export const metadata: Metadata = { title: "Pré-conferência" };

export default async function InboxPage() {
  const { workspace } = await getWorkspaceContext();
  const supabase = createClient();
  const { data } = await supabase
    .from("v_inbox_revisao")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const itens = (data as InboxItem[] | null) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pré-conferência"
        description="Confirme o que a IA capturou — sincronize itens repetidos para não duplicar."
      />
      <InboxView itens={itens} />
    </div>
  );
}
