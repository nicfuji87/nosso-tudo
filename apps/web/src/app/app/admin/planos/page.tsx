import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanoForm } from "@/components/admin/plano-form";
import type { Plan } from "@/lib/types/db";

export const metadata: Metadata = { title: "Planos · Admin" };

export default async function PlanosPage() {
  const admin = createAdminClient();
  const { data } = await admin.from("plans").select("*").order("ordem");
  const plans = (data as Plan[] | null) ?? [];

  return (
    <div className="space-y-6">
      <p className="text-body-sm text-muted-foreground">
        Preço e flags de cada plano. Limites e features são editados no schema (JSONB) — aqui ficam
        os controles comerciais do dia a dia.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plano) => (
          <PlanoForm key={plano.id} plano={plano} />
        ))}
      </div>
    </div>
  );
}
