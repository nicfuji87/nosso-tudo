"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { adicionarComissao, importarComissoesCsv, removerComissao } from "@/app/ml/(painel)/analytics/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, NativeSelect, Textarea } from "@/components/ml/campos";
import { fmtBrl, fmtData, fmtNum, parseBrl } from "./formato";

export interface ComissaoView {
  id: string;
  period_start: string;
  period_end: string;
  product: { id: string; title: string } | null;
  pin: { id: string; title: string | null } | null;
  external_ref: string | null;
  clicks: number | null;
  orders: number | null;
  gmv: number | null;
  commission: number;
  source: string;
  note: string | null;
}

export interface ProdutoOpcao {
  id: string;
  title: string;
}
export interface PinOpcao {
  id: string;
  title: string | null;
  product_id: string;
  published_at: string | null;
}

const ORIGEM: Record<string, string> = { manual: "Manual", csv: "CSV", api: "API" };

export function Comissoes({
  linhas,
  produtos,
  pins,
  podeOperar,
  podeRemover,
  de,
  ate,
}: {
  linhas: ComissaoView[];
  produtos: ProdutoOpcao[];
  pins: PinOpcao[];
  podeOperar: boolean;
  podeRemover: boolean;
  de: string;
  ate: string;
}) {
  const [dialogo, setDialogo] = useState<"adicionar" | "csv" | null>(null);
  const total = linhas.reduce((s, l) => s + l.commission, 0);

  return (
    <div className="space-y-3">
      {podeOperar && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialogo("csv")}>
            <FileUp />
            Importar CSV
          </Button>
          <Button variant="tech" size="sm" onClick={() => setDialogo("adicionar")}>
            <Plus />
            Adicionar comissão
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-body-sm font-medium">Nenhuma comissão no período</p>
          <p className="mx-auto mt-1 max-w-md text-caption text-muted-foreground">
            O programa de afiliados do Mercado Livre não tem API de relatórios. Lance a comissão à mão ou importe o CSV exportado do painel de
            afiliados para ver receita, receita por Pin e EPC.
          </p>
          {podeOperar && (
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogo("csv")}>
                Importar CSV
              </Button>
              <Button variant="tech" size="sm" onClick={() => setDialogo("adicionar")}>
                Adicionar comissão
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[52rem] text-body-sm">
            <thead>
              <tr className="text-overline uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 text-left font-medium">Período</th>
                <th className="pb-2 pr-3 text-left font-medium">Produto</th>
                <th className="pb-2 pr-3 text-left font-medium">Pin</th>
                <th className="pb-2 pr-3 text-left font-medium">Referência</th>
                <th className="pb-2 pl-2 text-right font-medium">Cliques</th>
                <th className="pb-2 pl-2 text-right font-medium">Pedidos</th>
                <th className="pb-2 pl-2 text-right font-medium">Vendido</th>
                <th className="pb-2 pl-2 text-right font-medium">Comissão</th>
                <th className="pb-2 pl-3 text-left font-medium">Origem</th>
                {podeRemover && <th className="pb-2" aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t border-border/60">
                  <td className="tabular whitespace-nowrap py-2 pr-3">
                    {l.period_start === l.period_end ? fmtData(l.period_start) : `${fmtData(l.period_start, true)} – ${fmtData(l.period_end)}`}
                  </td>
                  <td className="max-w-[14rem] py-2 pr-3">
                    {l.product ? (
                      <Link href={`/ml/produtos/${l.product.id}`} className="line-clamp-1 hover:underline" title={l.product.title}>
                        {l.product.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="max-w-[10rem] py-2 pr-3">
                    {l.pin ? (
                      <Link href={`/ml/publicacoes?pin=${l.pin.id}`} className="line-clamp-1 hover:underline">
                        {l.pin.title || "Pin"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="max-w-[9rem] truncate py-2 pr-3 text-caption text-muted-foreground" title={l.note ?? l.external_ref ?? undefined}>
                    {l.external_ref ?? "—"}
                  </td>
                  <td className="tabular py-2 pl-2 text-right">{l.clicks == null ? "—" : fmtNum(l.clicks)}</td>
                  <td className="tabular py-2 pl-2 text-right">{l.orders == null ? "—" : fmtNum(l.orders)}</td>
                  <td className="tabular py-2 pl-2 text-right">{l.gmv == null ? "—" : fmtBrl(l.gmv)}</td>
                  <td className="tabular py-2 pl-2 text-right font-medium">{fmtBrl(l.commission)}</td>
                  <td className="py-2 pl-3">
                    <Badge variant="outline" size="sm">
                      {ORIGEM[l.source] ?? l.source}
                    </Badge>
                  </td>
                  {podeRemover && (
                    <td className="py-1 pl-2 text-right">
                      <AcaoBotao
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remover comissão"
                        confirmar="Remover este lançamento de comissão? Esta ação não pode ser desfeita."
                        acao={() => removerComissao(l.id)}
                      >
                        <Trash2 />
                      </AcaoBotao>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={7} className="py-2 pr-3 text-right text-caption text-muted-foreground">
                  Total listado ({fmtNum(linhas.length)})
                </td>
                <td className="tabular py-2 pl-2 text-right font-semibold">{fmtBrl(total)}</td>
                <td colSpan={podeRemover ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {dialogo === "adicionar" && (
        <AdicionarDialog produtos={produtos} pins={pins} de={de} ate={ate} onClose={() => setDialogo(null)} />
      )}
      {dialogo === "csv" && <ImportarDialog onClose={() => setDialogo(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AdicionarDialog({
  produtos,
  pins,
  de,
  ate,
  onClose,
}: {
  produtos: ProdutoOpcao[];
  pins: PinOpcao[];
  de: string;
  ate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [inicio, setInicio] = useState(ate);
  const [fim, setFim] = useState(ate);
  const [busca, setBusca] = useState("");
  const [produto, setProduto] = useState("");
  const [pin, setPin] = useState("");
  const [ref, setRef] = useState("");
  const [cliques, setCliques] = useState("");
  const [pedidos, setPedidos] = useState("");
  const [gmv, setGmv] = useState("");
  const [comissao, setComissao] = useState("");
  const [nota, setNota] = useState("");

  const produtosFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t ? produtos.filter((p) => p.title.toLowerCase().includes(t)) : produtos;
    const atual = produtos.find((p) => p.id === produto);
    return atual && !lista.includes(atual) ? [atual, ...lista] : lista;
  }, [busca, produtos, produto]);
  const pinsDoProduto = produto ? pins.filter((p) => p.product_id === produto) : [];

  const inteiro = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v.replace(/\D/g, "")))));

  const salvar = () => {
    const valor = parseBrl(comissao);
    if (valor == null || valor < 0) return toast.error("Informe o valor da comissão.");
    if (!inicio || !fim || fim < inicio) return toast.error("Período inválido.");
    const g = gmv.trim() ? parseBrl(gmv) : null;
    if (gmv.trim() && g == null) return toast.error("Valor vendido inválido.");
    iniciar(async () => {
      const r = await adicionarComissao({
        period_start: inicio,
        period_end: fim,
        product_id: produto || null,
        pin_id: pin || null,
        external_ref: ref.trim() || null,
        clicks: inteiro(cliques),
        orders: inteiro(pedidos),
        gmv: g,
        commission: valor,
        note: nota.trim() || null,
      });
      if ("error" in r) return void toast.error(r.error);
      toast.success(r.mensagem ?? "Comissão registrada.");
      router.refresh();
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar comissão</DialogTitle>
          <DialogDescription>
            Lançamento manual do painel de afiliados. Vincule a um produto (e opcionalmente a um Pin) para o Analytics atribuir a receita.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Início do período">
            <Input type="date" value={inicio} max={fim || undefined} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo label="Fim do período">
            <Input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} />
          </Campo>
          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-body-sm font-medium">Produto</span>
            <Input placeholder="Buscar produto publicado/agendado…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" />
            <NativeSelect
              className="w-full"
              value={produto}
              onChange={(e) => {
                setProduto(e.target.value);
                setPin("");
              }}
              aria-label="Produto"
            >
              <option value="">Sem produto (comissão geral)</option>
              {produtosFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Campo label="Pin (opcional)" className="sm:col-span-2" dica={produto ? undefined : "Escolha um produto para listar os Pins dele."}>
            <NativeSelect className="w-full" value={pin} onChange={(e) => setPin(e.target.value)} disabled={!produto}>
              <option value="">Ratear entre os Pins do produto</option>
              {pinsDoProduto.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.title || "Pin").slice(0, 70)}
                  {p.published_at ? ` · ${fmtData(p.published_at, true)}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo label="Comissão (R$) *">
            <Input inputMode="decimal" placeholder="0,00" value={comissao} onChange={(e) => setComissao(e.target.value)} required />
          </Campo>
          <Campo label="Valor vendido (R$)">
            <Input inputMode="decimal" placeholder="0,00" value={gmv} onChange={(e) => setGmv(e.target.value)} />
          </Campo>
          <Campo label="Cliques">
            <Input inputMode="numeric" value={cliques} onChange={(e) => setCliques(e.target.value)} />
          </Campo>
          <Campo label="Pedidos">
            <Input inputMode="numeric" value={pedidos} onChange={(e) => setPedidos(e.target.value)} />
          </Campo>
          <Campo label="Referência" dica="ID do pedido/relatório. Evita lançar duas vezes a mesma linha." className="sm:col-span-2">
            <Input value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} />
          </Campo>
          <Campo label="Observação" className="sm:col-span-2">
            <Input value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
          </Campo>
        </div>
        <p className="text-caption text-muted-foreground">
          Período do Analytics: {fmtData(de)} – {fmtData(ate)}.
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="tech" size="sm" disabled={pendente} onClick={salvar}>
            {pendente && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function ImportarDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ mensagem: string; inseridas: number; duplicadas: number; erros: string[] } | null>(null);

  const importar = () => {
    if (!texto.trim()) return void toast.error("Escolha um arquivo ou cole o conteúdo do CSV.");
    iniciar(async () => {
      const r = await importarComissoesCsv(texto);
      if ("error" in r) return void toast.error(r.error);
      setResultado({ mensagem: r.mensagem, inseridas: r.inseridas, duplicadas: r.duplicadas, erros: r.erros });
      toast.success(r.mensagem);
      router.refresh();
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar comissões (CSV)</DialogTitle>
          <DialogDescription>Exporte o relatório do painel de afiliados do Mercado Livre e envie aqui.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-secondary/50 p-3 text-caption text-muted-foreground">
          <p className="font-medium text-foreground">Colunas aceitas (cabeçalho na 1ª linha, nomes flexíveis):</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              <strong>Data</strong> — ou <strong>Início</strong> e <strong>Fim</strong> do período
            </li>
            <li>
              <strong>Comissão</strong> (obrigatória)
            </li>
            <li>
              <strong>Produto</strong> ou <strong>Link</strong> com o código MLB… (vincula ao produto)
            </li>
            <li>
              <strong>Cliques</strong>, <strong>Vendas/Pedidos</strong>, <strong>Valor vendido</strong>, <strong>ID do pedido</strong>
            </li>
          </ul>
          <p className="mt-1.5">
            Separador vírgula, ponto e vírgula ou tab. Valores em formato brasileiro (R$ 1.234,56) funcionam. Reimportar o mesmo arquivo não
            duplica linhas.
          </p>
        </div>

        <Campo label="Arquivo">
          <Input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2_000_000) return void toast.error("Arquivo maior que 2 MB.");
              setTexto(await f.text());
              setArquivo(f.name);
              setResultado(null);
            }}
          />
        </Campo>
        <Campo label={arquivo ? `Conteúdo de ${arquivo}` : "…ou cole o conteúdo"}>
          <Textarea
            rows={7}
            className="font-mono text-caption"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setResultado(null);
            }}
            placeholder={"Data;Produto;Cliques;Vendas;Valor vendido;Comissão\n01/10/2026;MLB123456789;120;3;R$ 389,70;R$ 31,18"}
          />
        </Campo>

        {resultado && (
          <div className="space-y-2 rounded-xl border border-border/70 p-3" aria-live="polite">
            <p className="text-body-sm font-medium">{resultado.mensagem}</p>
            <div className="flex flex-wrap gap-2 text-caption">
              <Badge variant="success">{fmtNum(resultado.inseridas)} importada(s)</Badge>
              {resultado.duplicadas > 0 && <Badge variant="outline">{fmtNum(resultado.duplicadas)} já existiam</Badge>}
              {resultado.erros.length > 0 && <Badge variant="warning">{fmtNum(resultado.erros.length)} ignorada(s)</Badge>}
            </div>
            {resultado.erros.length > 0 && (
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4 text-caption text-warning">
                {resultado.erros.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {resultado.erros.length > 50 && <li>… e mais {resultado.erros.length - 50}</li>}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {resultado ? "Fechar" : "Voltar"}
          </Button>
          <Button variant="tech" size="sm" disabled={pendente || !texto.trim()} onClick={importar}>
            {pendente && <Loader2 className="animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
