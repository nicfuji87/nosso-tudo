import type { Metadata } from "next";
import { requireMlPage, temPapel } from "@/lib/ml/acesso";
import { lerConfig, salvarConfig } from "@/lib/ml/config";
import { createClient } from "@/lib/supabase/server";
import { MlShell } from "@/components/ml/shell";

export const metadata: Metadata = {
  title: { default: "Afiliados ML", template: "%s · Afiliados ML" },
};

interface Contadores {
  aguardando_aprovacao: number;
  aguardando_link: number;
  criativos_revisao: number;
  imagens_manuais: number;
  pins_aprovacao: number;
  pendencias_abertas: number;
}

export default async function MlLayout({ children }: { children: React.ReactNode }) {
  const sessao = await requireMlPage("viewer");
  const supabase = createClient();
  const [{ data }, auto] = await Promise.all([supabase.rpc("ml_dashboard"), lerConfig("automacao")]);
  const c = (data ?? {}) as Partial<Contadores>;
  const pendencias =
    (c.aguardando_aprovacao ?? 0) +
    (c.aguardando_link ?? 0) +
    (c.criativos_revisao ?? 0) +
    (c.imagens_manuais ?? 0) +
    (c.pins_aprovacao ?? 0) +
    (c.pendencias_abertas ?? 0);

  // Em produção, registra onde o pg_cron deve chamar o worker (zero configuração manual).
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && !/localhost|127\.0\.0\.1/.test(site) && temPapel(sessao.role, "admin")) {
    const rt = await lerConfig("runtime");
    if (rt.app_url !== site) await salvarConfig("runtime", { app_url: site }, sessao.userId);
  }

  return (
    <MlShell pendencias={pendencias} pausado={auto.pausado} email={sessao.email} papel={sessao.role}>
      {children}
    </MlShell>
  );
}
