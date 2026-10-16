"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { criarPagina } from "@/app/ml/(painel)/paginas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, Checkbox, Secao } from "@/components/ml/campos";
import { CopiarUrl } from "./copiar-url";

/** Criador de páginas: cola o link → a página nasce com os dados do anúncio → copia a URL para o Pin. */
export function NovaPagina({ podeEditar }: { podeEditar: boolean }) {
  const router = useRouter();
  const [afiliado, setAfiliado] = useState("");
  const [produto, setProduto] = useState("");
  const [publicar, setPublicar] = useState(true);
  const [pendente, iniciar] = useTransition();
  const [criada, setCriada] = useState<{ id: string; url: string; status: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await criarPagina({ linkAfiliado: afiliado, linkProduto: produto || null, publicar });
      if ("error" in r && r.error) {
        setErro(r.error);
        return;
      }
      const ok = r as { id: string; url: string; status: string; mensagem: string };
      toast.success(ok.mensagem);
      setCriada({ id: ok.id, url: ok.url, status: ok.status });
      setAfiliado("");
      setProduto("");
      router.refresh();
    });

  return (
    <Secao
      titulo="Nova página"
      descricao="Cole o link de afiliado do Mercado Livre. O app busca foto, título e características do anúncio e cria a página que vai no Pin."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (podeEditar && afiliado.trim()) enviar();
        }}
      >
        <fieldset disabled={!podeEditar || pendente} className="grid gap-4 md:grid-cols-2">
          <Campo label="Link de afiliado" dica="O link gerado no painel de afiliados (meli.la/… ou mercadolivre.com/sec/…).">
            <Input value={afiliado} onChange={(e) => setAfiliado(e.target.value)} placeholder="https://meli.la/…" inputMode="url" autoComplete="off" />
          </Campo>
          <Campo
            label="Link do produto"
            dica="A página do anúncio (…/p/MLB… ou produto.mercadolivre.com.br/MLB-…). Obrigatório para link curto: ele leva à sua vitrine, não ao produto."
          >
            <Input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="https://www.mercadolivre.com.br/…/p/MLB…" inputMode="url" autoComplete="off" />
          </Campo>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-body-sm">
            <Checkbox checked={publicar} onChange={(e) => setPublicar(e.target.checked)} disabled={!podeEditar || pendente} />
            Publicar agora (dá para editar depois)
          </label>
          <Button type="submit" disabled={!podeEditar || pendente || !afiliado.trim()}>
            {pendente ? <Loader2 className="animate-spin" /> : <Wand2 />} Criar página
          </Button>
        </div>
        {erro && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-caption text-destructive">
            {erro}
          </p>
        )}
      </form>

      {criada && (
        <div className="mt-4 space-y-2 rounded-xl border border-success/40 bg-success/5 p-3">
          <p className="flex items-center gap-1.5 text-body-sm font-medium">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {criada.status === "published" ? "Página publicada — use esta URL no campo Link do Pin:" : "Rascunho criado. Publique para a URL funcionar:"}
          </p>
          <CopiarUrl url={criada.url} destaque />
          <Link href={`/ml/paginas/${criada.id}`} className="inline-block text-caption underline">
            Revisar textos e fotos
          </Link>
        </div>
      )}
    </Secao>
  );
}
