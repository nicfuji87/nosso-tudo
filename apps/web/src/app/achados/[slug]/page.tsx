import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ExternalLink, Info } from "lucide-react";
import { mlDb } from "@/lib/ml/db";
import { slugValido } from "@/lib/ml/paginas/regras";
import { BotaoOferta, ContarVisita } from "./rastreio";

/**
 * Página pública de um produto (destino do Pin). Conteúdo real + botão que a PESSOA clica
 * para ir ao Mercado Livre. Não há redirecionamento automático, e o destino do botão vem
 * do banco (gravado e validado pelo servidor) — nunca de parâmetro da URL.
 * O mesmo HTML para pessoas e robôs (sem cloaking).
 */
export const revalidate = 300;

interface Pagina {
  slug: string;
  titulo: string;
  resumo: string | null;
  destaques: unknown;
  imagens: unknown;
  cta: string;
  affiliate_url: string;
  status: string;
}

const carregar = cache(async (slug: string): Promise<Pagina | null> => {
  if (!slugValido(slug)) return null;
  const { data } = await mlDb()
    .from("ml_paginas")
    .select("slug, titulo, resumo, destaques, imagens, cta, affiliate_url, status")
    .eq("slug", slug)
    .in("status", ["published", "paused"])
    .maybeSingle();
  return (data as Pagina | null) ?? null;
});

function imagens(p: Pagina): { url: string; alt: string }[] {
  return Array.isArray(p.imagens)
    ? (p.imagens as { url?: unknown; alt?: unknown }[])
        .filter((i) => typeof i.url === "string")
        .map((i) => ({ url: i.url as string, alt: typeof i.alt === "string" ? i.alt : p.titulo }))
    : [];
}

function destaques(p: Pagina): string[] {
  return Array.isArray(p.destaques) ? (p.destaques as unknown[]).filter((d): d is string => typeof d === "string" && !!d.trim()) : [];
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await carregar(params.slug);
  if (!p) return { title: "Página não encontrada" };
  const capa = imagens(p)[0];
  const descricao = p.resumo ?? `Achado para a casa: ${p.titulo}.`;
  return {
    title: p.titulo,
    description: descricao,
    openGraph: { title: p.titulo, description: descricao, type: "website", images: capa ? [{ url: capa.url, alt: capa.alt }] : [] },
  };
}

export default async function PaginaAchado({ params }: { params: { slug: string } }) {
  const p = await carregar(params.slug);
  if (!p) notFound();
  const fotos = imagens(p);
  const lista = destaques(p);
  const ativa = p.status === "published";

  return (
    <article className="container max-w-2xl space-y-6 py-6 sm:py-10">
      {ativa && <ContarVisita slug={p.slug} />}
      <p className="flex items-start gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-caption text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Indicação da Casa Prática. Se você comprar pelo botão abaixo, podemos receber uma comissão do Mercado Livre — sem custo extra para você.
      </p>

      {fotos.length > 0 && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do CDN do ML, host validado no servidor */}
          <img src={fotos[0]!.url} alt={fotos[0]!.alt} className="aspect-[4/3] w-full rounded-2xl border border-border/70 bg-white object-contain" />
          {fotos.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {fotos.slice(1, 5).map((f) => (
                // eslint-disable-next-line @next/next/no-img-element -- idem
                <img key={f.url} src={f.url} alt={f.alt} loading="lazy" className="aspect-square w-full rounded-lg border border-border/70 bg-white object-contain" />
              ))}
            </div>
          )}
        </div>
      )}

      <header className="space-y-2">
        <h1 className="text-h3 font-semibold leading-tight text-foreground">{p.titulo}</h1>
        {p.resumo && <p className="text-body text-muted-foreground">{p.resumo}</p>}
      </header>

      {ativa ? (
        <div className="space-y-2">
          <BotaoOferta slug={p.slug} href={p.affiliate_url}>
            {p.cta} <ExternalLink className="size-4" aria-hidden />
          </BotaoOferta>
          <p className="text-center text-caption text-muted-foreground">
            Você vai para o Mercado Livre. Preço, frete e disponibilidade são os de lá, no momento da compra.
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-border px-4 py-3 text-center text-body-sm text-muted-foreground">
          Este achado não está mais disponível.
        </p>
      )}
      {lista.length > 0 && (
        <ul className="space-y-1.5 text-body-sm text-foreground">
          {lista.map((d) => (
            <li key={d} className="flex gap-2">
              <span aria-hidden className="text-muted-foreground">
                •
              </span>
              {d}
            </li>
          ))}
        </ul>
      )}

    </article>
  );
}
