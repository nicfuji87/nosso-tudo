import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireMlPage, temPapel } from "@/lib/ml/acesso";
import { urlPagina } from "@/lib/ml/paginas/regras";
import { basePaginas } from "@/lib/ml/servicos/paginas";
import { PageHeader } from "@/components/patterns/page-header";
import { EditorPagina } from "@/components/ml/paginas/editor-pagina";

export const metadata: Metadata = { title: "Editar página" };

export default async function EditarPaginaPage({ params }: { params: { id: string } }) {
  const sessao = await requireMlPage("viewer");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = createClient();
  const { data } = await supabase
    .from("ml_paginas")
    .select("id, slug, titulo, resumo, destaques, imagens, cta, status, affiliate_url, product_id, visitas, cliques")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as {
    id: string;
    slug: string;
    titulo: string;
    resumo: string | null;
    destaques: unknown;
    imagens: unknown;
    cta: string;
    status: "draft" | "published" | "paused";
    affiliate_url: string;
    product_id: string | null;
    visitas: number;
    cliques: number;
  };

  // Fotos disponíveis: as do anúncio (catálogo) + as já escolhidas.
  let fotosProduto: string[] = [];
  if (p.product_id) {
    const { data: prod } = await supabase.from("ml_products").select("pictures, thumbnail").eq("id", p.product_id).maybeSingle();
    const pr = prod as { pictures: unknown; thumbnail: string | null } | null;
    fotosProduto = Array.isArray(pr?.pictures) ? (pr!.pictures as { url?: unknown }[]).map((f) => (typeof f.url === "string" ? f.url.replace(/^http:/, "https:") : "")).filter(Boolean) : [];
    if (!fotosProduto.length && pr?.thumbnail) fotosProduto = [pr.thumbnail];
  }
  const escolhidas = Array.isArray(p.imagens) ? (p.imagens as { url?: unknown; alt?: unknown }[]).filter((i) => typeof i.url === "string").map((i) => ({ url: i.url as string, alt: typeof i.alt === "string" ? i.alt : "" })) : [];
  const destaques = Array.isArray(p.destaques) ? (p.destaques as unknown[]).filter((d): d is string => typeof d === "string") : [];

  return (
    <div className="space-y-6">
      <Link href="/ml/paginas" className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Páginas
      </Link>
      <PageHeader title="Editar página" description="O que aparece para quem clica no Pin. Mantenha título e fotos fiéis ao anúncio." />
      <EditorPagina
        pagina={{ id: p.id, titulo: p.titulo, resumo: p.resumo, destaques, imagens: escolhidas, cta: p.cta, status: p.status, affiliateUrl: p.affiliate_url, productId: p.product_id, visitas: p.visitas, cliques: p.cliques }}
        url={urlPagina(basePaginas(), p.slug)}
        fotosProduto={fotosProduto}
        podeEditar={temPapel(sessao.role, "operator")}
      />
    </div>
  );
}
