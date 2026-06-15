import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnunciosManager } from "@/components/admin/anuncios-manager";
import type { Anuncio } from "@/lib/types/db";

export const metadata: Metadata = { title: "Anúncios · Admin" };

export default async function AnunciosPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("anuncios")
    .select("*")
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: false });
  const anuncios = (data as Anuncio[] | null) ?? [];

  return (
    <div className="space-y-6">
      <p className="text-body-sm text-muted-foreground">
        Anúncios discretos exibidos para o plano Free (RF-100+). Posições sugeridas:{" "}
        <code className="font-mono">home_topo</code>, <code className="font-mono">lista_rodape</code>.
      </p>
      <AnunciosManager anuncios={anuncios} />
    </div>
  );
}
