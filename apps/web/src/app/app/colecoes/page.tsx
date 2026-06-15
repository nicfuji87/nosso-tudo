import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Plane, ShoppingBag } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Coleções" };

interface ColecaoRow {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  icone: string | null;
  orcamento_previsto: number | null;
  valor_estimado: number | null;
  valor_final: number | null;
  data_inicio: string | null;
  status_projeto: string | null;
  status_compromisso: string | null;
  categoria: { nome: string; comportamento: string } | null;
}

export default async function ColecoesPage() {
  const { workspace } = await getWorkspaceContext();
  const supabase = createClient();
  const { data } = await supabase
    .from("colecoes")
    .select(
      "id,nome,descricao,cor,icone,orcamento_previsto,valor_estimado,valor_final,data_inicio,status_projeto,status_compromisso, categoria:categorias(nome,comportamento)",
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const colecoes = (data as unknown as ColecaoRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coleções"
        description="Viagens, reformas, compras coletivas — o que foge do mês a mês."
      />

      {colecoes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhuma coleção ainda"
          description="Coleções são instâncias de categorias do tipo projeto ou compromisso. Crie uma categoria com esse comportamento em Cadastros para começar."
          action={
            <Button asChild variant="secondary">
              <Link href="/app/cadastros">Ir para Cadastros</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {colecoes.map((c) => {
            const isProjeto = c.categoria?.comportamento === "projeto";
            const status = c.status_projeto ?? c.status_compromisso;
            const meta = isProjeto ? c.orcamento_previsto : (c.valor_final ?? c.valor_estimado);
            return (
              <Card key={c.id} interactive>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <span
                      className="flex size-11 items-center justify-center rounded-[14px] text-xl"
                      style={{ backgroundColor: `${c.cor ?? "#8FA993"}22` }}
                    >
                      {c.icone ?? (isProjeto ? <Plane className="size-5" /> : <ShoppingBag className="size-5" />)}
                    </span>
                    {status && <Badge size="sm">{status.replace(/_/g, " ")}</Badge>}
                  </div>
                  <div>
                    <p className="font-medium">{c.nome}</p>
                    <p className="text-caption text-muted-foreground">
                      {c.categoria?.nome ?? "Coleção"}
                      {c.data_inicio ? ` · ${formatDate(c.data_inicio)}` : ""}
                    </p>
                  </div>
                  {meta != null && (
                    <p className="tabular text-body-sm text-muted-foreground">
                      {isProjeto ? "Orçamento" : "Valor"}: {formatBRL(meta)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
