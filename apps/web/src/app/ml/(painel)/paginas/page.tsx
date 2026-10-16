import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireMlPage, temPapel } from "@/lib/ml/acesso";
import { urlPagina } from "@/lib/ml/paginas/regras";
import { basePaginas } from "@/lib/ml/servicos/paginas";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { NovaPagina } from "@/components/ml/paginas/nova-pagina";
import { CopiarUrl } from "@/components/ml/paginas/copiar-url";
import { STATUS_PAGINA } from "@/components/ml/paginas/rotulos";
import { mudarStatusPagina } from "./actions";

export const metadata: Metadata = { title: "Páginas" };

interface Linha {
  id: string;
  slug: string;
  titulo: string;
  status: "draft" | "published" | "paused";
  imagens: unknown;
  visitas: number;
  cliques: number;
  product_id: string | null;
  updated_at: string;
}

export default async function PaginasPage() {
  const sessao = await requireMlPage("viewer");
  const podeEditar = temPapel(sessao.role, "operator");
  const supabase = createClient();
  const { data } = await supabase
    .from("ml_paginas")
    .select("id, slug, titulo, status, imagens, visitas, cliques, product_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  const linhas = (data ?? []) as Linha[];
  const base = basePaginas();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Páginas"
        description="Páginas de produto que vão no Pin. O Pinterest não aceita link do Mercado Livre direto: o Pin leva a esta página, e a pessoa clica para ir ao anúncio."
      />
      <NovaPagina podeEditar={podeEditar} />

      {linhas.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhuma página ainda" description="Cole um link de afiliado acima para criar a primeira." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {linhas.map((p) => {
            const capa = Array.isArray(p.imagens) ? (p.imagens as { url?: string }[])[0]?.url : undefined;
            const s = STATUS_PAGINA[p.status];
            return (
              <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {capa ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura do CDN do ML
                    <img src={capa} alt="" className="size-14 shrink-0 rounded-lg border border-border bg-white object-contain" />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                      <ImageOff className="size-5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/ml/paginas/${p.id}`} className="truncate font-medium hover:underline">
                        {p.titulo}
                      </Link>
                      <Badge variant={s.variante}>{s.label}</Badge>
                    </div>
                    <CopiarUrl url={urlPagina(base, p.slug)} />
                    <p className="text-caption text-muted-foreground tabular">
                      {p.visitas} visita{p.visitas === 1 ? "" : "s"} · {p.cliques} clique{p.cliques === 1 ? "" : "s"} no botão
                      {p.product_id && (
                        <>
                          {" · "}
                          <Link href={`/ml/produtos/${p.product_id}`} className="underline">
                            produto
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/ml/paginas/${p.id}`}>Editar</Link>
                  </Button>
                  {podeEditar &&
                    (p.status === "published" ? (
                      <AcaoBotao size="sm" variant="ghost" acao={() => mudarStatusPagina(p.id, "paused")} confirmar="Pausar? Quem abrir o Pin verá “não disponível”, sem o botão.">
                        Pausar
                      </AcaoBotao>
                    ) : (
                      <AcaoBotao size="sm" variant="ghost" acao={() => mudarStatusPagina(p.id, "published")}>
                        Publicar
                      </AcaoBotao>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
