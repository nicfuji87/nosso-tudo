import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { isPlatformAdmin } from "@/lib/auth";
import { getNiaConfigCompleta, getOpcoesAgente, getUsoNia } from "@/lib/nia/admin";
import { NiaConsoleForm } from "@/components/admin/nia-console";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Nia · Admin" };

const usd = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(v);

export default async function AdminNiaPage() {
  const admin = await isPlatformAdmin();
  if (!admin) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-4 text-body-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        O console da Nia (uso, custos e config do agente) é restrito a admins de plataforma.
      </div>
    );
  }

  const [uso, config, opcoes] = await Promise.all([
    getUsoNia(30),
    getNiaConfigCompleta(),
    getOpcoesAgente(),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Mensagens (30d)" value={formatNumber(uso.totalMensagens)} />
          <Metric label="Tokens (30d)" value={formatNumber(uso.totalTokens)} />
          <Metric label="Custo (30d)" value={usd(uso.totalCusto)} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-caption text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Usuário</th>
                <th className="px-4 py-3 text-left font-medium">Espaço</th>
                <th className="px-4 py-3 text-right font-medium">Msgs</th>
                <th className="px-4 py-3 text-right font-medium">Tokens</th>
                <th className="px-4 py-3 text-right font-medium">Custo</th>
              </tr>
            </thead>
            <tbody>
              {uso.linhas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum uso da Nia nos últimos 30 dias.
                  </td>
                </tr>
              ) : (
                uso.linhas.map((l) => (
                  <tr key={l.profileId} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{l.nome}</p>
                      {l.email && <p className="text-caption text-muted-foreground">{l.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.workspaceNome}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatNumber(l.mensagens)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatNumber(l.tokensEntrada + l.tokensSaida)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{usd(l.custo)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-caption text-muted-foreground">
          Custos em USD a partir de <code className="font-mono">nia_precos</code> (ajuste os preços
          conforme o provedor).
        </p>
      </section>

      <NiaConsoleForm initial={config} opcoes={opcoes} canEdit={admin} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/60 p-4">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-h4 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
