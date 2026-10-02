"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Link2, Loader2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { removerLinkAfiliado, salvarLinkAfiliado, validarLinkAfiliado } from "@/app/ml/(painel)/produtos/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo } from "@/components/ml/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LinkAtivo {
  url: string;
  label: string | null;
  validadoEm: string | null;
  criadoEm: string;
  tipo: string | null;
  avisos: string[];
  fonte: string;
}

export interface LinkAntigo {
  id: string;
  url: string;
  label: string | null;
  criadoEm: string;
  desativadoEm: string | null;
}

interface Validacao {
  valido: boolean;
  tipo: string | null;
  erros: string[];
  avisos: string[];
}

/** Link de afiliado: ativo, histórico e formulário validar/salvar/remover (spec §8). */
export function LinkAfiliado({
  productId,
  ativo,
  historico,
  podeOperar,
}: {
  productId: string;
  ativo: LinkAtivo | null;
  historico: LinkAntigo[];
  podeOperar: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState(ativo?.label ?? "");
  const [validacao, setValidacao] = useState<Validacao | null>(null);
  const [validando, iniciarValidacao] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();
  const ocupado = validando || salvando;

  function validar() {
    iniciarValidacao(async () => {
      const r = await validarLinkAfiliado(productId, url.trim());
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setValidacao({ valido: r.valido, tipo: r.tipo ?? null, erros: r.erros, avisos: r.avisos });
    });
  }

  function salvar() {
    iniciarSalvar(async () => {
      const r = await salvarLinkAfiliado(productId, url.trim(), label.trim() || null);
      if ("error" in r) {
        toast.error(r.error);
        setValidacao(null);
        return;
      }
      toast.success(r.mensagem, r.avisos.length ? { description: r.avisos.join(" ") } : undefined);
      setUrl("");
      setValidacao(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {ativo ? (
        <div className="space-y-2 rounded-xl border border-success/30 bg-success/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">
              <CheckCircle2 className="size-3.5" aria-hidden /> Link ativo
            </Badge>
            {ativo.label && <Badge variant="outline">{ativo.label}</Badge>}
            {ativo.tipo && <span className="text-caption text-muted-foreground">Tipo: {ativo.tipo}</span>}
          </div>
          <p className="break-all font-mono text-caption">{ativo.url}</p>
          <p className="text-caption text-muted-foreground">
            Salvo {ativo.criadoEm}
            {ativo.validadoEm ? ` · validado ${ativo.validadoEm}` : ""} · origem {ativo.fonte === "api" ? "API" : "manual"}
          </p>
          {ativo.avisos.length > 0 && (
            <ul className="space-y-0.5">
              {ativo.avisos.map((a, i) => (
                <li key={i} className="flex gap-1.5 text-caption text-warning">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> {a}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(ativo.url).then(
                  () => toast.success("Link copiado."),
                  () => toast.error("Não foi possível copiar."),
                );
              }}
            >
              <Copy /> Copiar
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={ativo.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Abrir
              </a>
            </Button>
            {podeOperar && (
              <AcaoBotao
                size="sm"
                variant="ghost"
                className="text-destructive"
                acao={() => removerLinkAfiliado(productId)}
                confirmar="Remover o link de afiliado ativo? O produto volta a aguardar link."
              >
                <Trash2 /> Remover
              </AcaoBotao>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">
          <Link2 className="size-4 shrink-0" aria-hidden /> Sem link de afiliado ativo.
        </div>
      )}

      {podeOperar && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) salvar();
          }}
        >
          <Campo label={ativo ? "Substituir por novo link" : "URL de afiliado"} dica="Gere no painel de afiliados do Mercado Livre e cole aqui.">
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setValidacao(null);
              }}
              placeholder="https://mercadolivre.com/sec/…"
              inputMode="url"
              disabled={ocupado}
              className="h-10"
            />
          </Campo>
          <Campo label="Tag interna (opcional)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Ex.: campanha-outubro" disabled={ocupado} className="h-10" />
          </Campo>

          {validacao && (
            <div
              className={
                validacao.valido
                  ? "space-y-1 rounded-xl border border-success/30 bg-success/5 p-3"
                  : "space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
              }
              aria-live="polite"
            >
              <p className={validacao.valido ? "flex items-center gap-1.5 text-body-sm font-medium text-success" : "flex items-center gap-1.5 text-body-sm font-medium text-destructive"}>
                {validacao.valido ? <ShieldCheck className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
                {validacao.valido ? "Link válido" : "Link inválido"}
                {validacao.tipo && <span className="font-normal text-muted-foreground">· {validacao.tipo}</span>}
              </p>
              {validacao.erros.map((e, i) => (
                <p key={`e${i}`} className="text-caption text-destructive">
                  {e}
                </p>
              ))}
              {validacao.avisos.map((a, i) => (
                <p key={`a${i}`} className="flex gap-1.5 text-caption text-warning">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> {a}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={validar} disabled={ocupado || !url.trim()}>
              {validando ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Validar
            </Button>
            <Button type="submit" size="sm" variant="tech" disabled={ocupado || !url.trim() || validacao?.valido === false}>
              {salvando ? <Loader2 className="animate-spin" /> : <Link2 />} Salvar
            </Button>
          </div>
        </form>
      )}

      {historico.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-caption font-medium text-muted-foreground hover:text-foreground">
            Histórico de links ({historico.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {historico.map((h) => (
              <li key={h.id} className="rounded-lg border border-border/70 p-2">
                <p className="break-all font-mono text-caption text-muted-foreground line-through decoration-muted-foreground/40">{h.url}</p>
                <p className="text-caption text-muted-foreground">
                  {h.label ? `${h.label} · ` : ""}salvo {h.criadoEm}
                  {h.desativadoEm ? ` · desativado ${h.desativadoEm}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
