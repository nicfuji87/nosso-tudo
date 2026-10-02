"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, Pencil, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/patterns/empty-state";
import { Checkbox, Secao } from "@/components/ml/campos";
import { atualizarBoard } from "@/app/ml/(painel)/configuracoes/actions";
import { useAcao } from "@/components/ml/integracoes/comum";
import { cn } from "@/lib/utils";

export interface BoardLite {
  id: string;
  name: string;
  pin_count: number | null;
  privacy: string | null;
  category_ids: string[];
  is_default: boolean;
  active: boolean;
}

export interface OpcaoCategoria {
  id: string;
  nome: string;
  acompanhada: boolean;
}

function DialogoCategorias({
  board,
  opcoes,
  onFechar,
}: {
  board: BoardLite;
  opcoes: OpcaoCategoria[];
  onFechar: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(board.category_ids));
  const [filtro, setFiltro] = useState("");
  const { pendente, executar } = useAcao();
  const visiveis = opcoes.filter((o) => !filtro.trim() || o.nome.toLocaleLowerCase("pt-BR").includes(filtro.trim().toLocaleLowerCase("pt-BR")));
  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categorias do board “{board.name}”</DialogTitle>
          <DialogDescription>Produtos destas categorias vão para este board. Um board pode receber várias categorias.</DialogDescription>
        </DialogHeader>
        {opcoes.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            Nenhuma categoria acompanhada.{" "}
            <Link href="/ml/configuracoes?secao=categorias" className="text-tech underline-offset-4 hover:underline">
              Escolha categorias
            </Link>{" "}
            primeiro.
          </p>
        ) : (
          <div className="space-y-3">
            {opcoes.length > 8 && <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar categorias…" aria-label="Filtrar categorias" />}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {visiveis.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary/60">
                    <Checkbox
                      checked={sel.has(o.id)}
                      onChange={(e) =>
                        setSel((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(o.id);
                          else n.delete(o.id);
                          return n;
                        })
                      }
                      disabled={pendente}
                    />
                    <span className="text-body-sm">{o.nome}</span>
                    {!o.acompanhada && <span className="text-caption text-muted-foreground">(não acompanhada)</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button
            variant="tech"
            disabled={pendente}
            onClick={async () => {
              const ok = await executar(() => atualizarBoard(board.id, { category_ids: [...sel] }));
              if (ok) onFechar();
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinhaBoard({ board, nomes, opcoes, podeEditar }: { board: BoardLite; nomes: Map<string, string>; opcoes: OpcaoCategoria[]; podeEditar: boolean }) {
  const { pendente, executar } = useAcao();
  const [editando, setEditando] = useState(false);
  return (
    <li className={cn("flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center", !board.active && "opacity-70")}>
      <div className="min-w-0 md:w-56">
        <p className="truncate text-body-sm font-semibold" title={board.name}>
          {board.name}
        </p>
        <p className="tabular text-caption text-muted-foreground">
          {board.pin_count ?? 0} Pins{board.privacy && board.privacy !== "PUBLIC" ? " · privado" : ""}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {board.category_ids.length === 0 ? (
          <span className="text-caption text-muted-foreground">{board.is_default ? "Recebe as categorias sem board próprio" : "Nenhuma categoria"}</span>
        ) : (
          board.category_ids.map((id) => (
            <Badge key={id} variant="outline" size="default" className="max-w-[14rem] truncate">
              {nomes.get(id) ?? id}
            </Badge>
          ))
        )}
        {podeEditar && (
          <Button size="sm" variant="ghost" className="h-8 px-3" onClick={() => setEditando(true)} disabled={pendente}>
            <Pencil /> Categorias
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-caption">
          <input
            type="radio"
            name="board-padrao"
            checked={board.is_default}
            onChange={() => void executar(() => atualizarBoard(board.id, { is_default: true }))}
            disabled={!podeEditar || pendente || !board.active}
            className="size-4 accent-[rgb(var(--tech))]"
          />
          {board.is_default ? (
            <span className="flex items-center gap-1 font-medium text-tech">
              <Star className="size-3.5" aria-hidden /> Padrão
            </span>
          ) : (
            "Padrão"
          )}
        </label>
        <label className="flex items-center gap-2 text-caption">
          <Switch
            checked={board.active}
            onCheckedChange={(v) => void executar(() => atualizarBoard(board.id, v ? { active: true } : { active: false, is_default: false }))}
            disabled={!podeEditar || pendente}
            aria-label={`Board ${board.name} ativo`}
          />
          {board.active ? "Ativo" : "Inativo"}
        </label>
      </div>
      {editando && <DialogoCategorias board={board} opcoes={opcoes} onFechar={() => setEditando(false)} />}
    </li>
  );
}

export function BoardsPorCategoria({
  boards,
  categorias,
  podeEditar,
}: {
  boards: BoardLite[];
  categorias: OpcaoCategoria[];
  podeEditar: boolean;
}) {
  const nomes = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);
  const semPadrao = boards.length > 0 && !boards.some((b) => b.is_default && b.active);
  const acompanhadasSemBoard = categorias.filter(
    (c) => c.acompanhada && !boards.some((b) => b.active && b.category_ids.includes(c.id)),
  );

  return (
    <Secao titulo="Boards por categoria" descricao="Escolha em qual board do Pinterest cada categoria é publicada. O board padrão recebe o que não tiver board próprio.">
      {boards.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nenhum board sincronizado"
          description="Conecte o Pinterest e sincronize os seus boards para escolher onde cada categoria é publicada."
          action={
            <Button asChild variant="tech" size="sm">
              <Link href="/ml/integracoes#pinterest">Ir para Integrações › Sincronizar boards</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {semPadrao && (
            <p className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-caption">
              Nenhum board padrão ativo: categorias sem board próprio não terão onde publicar. Marque um como <strong>Padrão</strong>.
            </p>
          )}
          {!semPadrao && acompanhadasSemBoard.length > 0 && (
            <p className="text-caption text-muted-foreground">
              {acompanhadasSemBoard.length} categoria(s) acompanhada(s) usam o board padrão: {acompanhadasSemBoard.slice(0, 5).map((c) => c.nome).join(", ")}
              {acompanhadasSemBoard.length > 5 ? "…" : ""}
            </p>
          )}
          <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
            {boards.map((b) => (
              <LinhaBoard key={b.id} board={b} nomes={nomes} opcoes={categorias} podeEditar={podeEditar} />
            ))}
          </ul>
          <p className="text-caption text-muted-foreground">
            Faltou algum board?{" "}
            <Link href="/ml/integracoes#pinterest" className="text-tech underline-offset-4 hover:underline">
              Sincronize ou crie em Integrações
            </Link>
            .
          </p>
        </div>
      )}
    </Secao>
  );
}
