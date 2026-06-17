import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { isPlatformAdmin } from "@/lib/auth";
import { getRecorrenciasCronStatus } from "@/lib/admin/recorrencias";
import { RecorrenciasCron } from "@/components/admin/recorrencias-cron";

export const metadata: Metadata = { title: "Recorrências · Admin" };

export default async function AdminRecorrenciasPage() {
  const admin = await isPlatformAdmin();
  const status = admin ? await getRecorrenciasCronStatus() : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-h4 font-semibold">Contas fixas (recorrências)</h2>
        <p className="text-body-sm text-muted-foreground">
          Controle do job que materializa automaticamente as contas fixas em lançamentos.
        </p>
      </div>

      {!admin ? (
        <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-4 text-body-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          O controle do agendamento é restrito a admins de plataforma.
        </div>
      ) : (
        <RecorrenciasCron status={status} canEdit={admin} />
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5 text-body-sm">
        <h3 className="font-medium">Como funciona</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>
            Job <code className="font-mono">gerar-recorrencias-diario</code> (pg_cron) roda{" "}
            <span className="text-foreground">todo dia às 09:00 UTC (~06:00 BRT)</span> e chama a função{" "}
            <code className="font-mono">gerar_recorrencias_due()</code>.
          </li>
          <li>
            Para cada conta fixa <span className="text-foreground">ativa</span>, ela cria as transações dos
            vencimentos até hoje (origem <code className="font-mono">recorrente</code>, status{" "}
            <code className="font-mono">confirmado</code>) e avança a próxima geração conforme a frequência.
          </li>
          <li>
            É <span className="text-foreground">idempotente</span>: não duplica um lançamento já gerado (mesma
            recorrência + data). Cada conta fixa também pode ser pausada individualmente na aba{" "}
            <span className="text-foreground">Contas fixas</span> dos Cadastros.
          </li>
          <li>
            <span className="text-foreground">Desligar aqui</span> pausa o job inteiro (nada é gerado), sem apagar
            as contas fixas nem os lançamentos já criados. <span className="text-foreground">Rodar agora</span>{" "}
            executa a geração fora do horário.
          </li>
        </ul>
        <p className="text-caption text-muted-foreground">
          Definições em <code className="font-mono">supabase/migrations/0017_recorrencias_gen.sql</code> e{" "}
          <code className="font-mono">0018_recorrencias_admin.sql</code>.
        </p>
      </section>
    </div>
  );
}
