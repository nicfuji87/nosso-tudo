"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  ChevronDown,
  CreditCard,
  Landmark,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Tag,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryIcon } from "@/components/patterns/category-icon";
import { EmptyState } from "@/components/patterns/empty-state";
import { FieldError } from "@/components/auth/field-error";
import { MoneyInput } from "@/components/transacoes/money-input";
import { CategoriaPicker } from "@/components/transacoes/categoria-picker";
import { toast } from "@/components/ui/sonner";
import { formatBRL, formatDate } from "@/lib/format";
import {
  cartaoSchema,
  categoriaSchema,
  contaSchema,
  entidadeSchema,
  recorrenciaSchema,
  type CartaoInput,
  type CategoriaInput,
  type ContaInput,
  type EntidadeInput,
  type RecorrenciaInput,
} from "@/lib/schemas/cadastros";
import {
  COMPORTAMENTOS_CATEGORIA,
  ESSENCIALIDADES,
  FREQUENCIAS_RECORRENCIA,
  LABEL_COMPORTAMENTO,
  LABEL_ESSENCIALIDADE,
  LABEL_FREQUENCIA,
  LABEL_MEIO_PAGAMENTO,
  LABEL_TIPO_CONTA,
  MEIOS_PAGAMENTO,
  TIPOS_CONTA_BANCARIA,
  type Cartao,
  type Categoria,
  type ContaBancaria,
  type Entidade,
  type Essencialidade,
  type Recorrencia,
} from "@/lib/types/db";
import {
  alternarRecorrencia,
  arquivarCategoria,
  atualizarCartao,
  atualizarCategoria,
  atualizarConta,
  atualizarEntidade,
  atualizarRecorrencia,
  criarCartao,
  criarCategoria,
  criarConta,
  criarEntidade,
  criarRecorrencia,
  excluirCartao,
  excluirConta,
  excluirEntidade,
  excluirRecorrencia,
} from "@/app/app/cadastros/actions";

export function CadastrosView({
  entidades,
  categorias,
  contas,
  cartoes,
  recorrencias,
}: {
  entidades: Entidade[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: Cartao[];
  recorrencias: Recorrencia[];
}) {
  return (
    <Tabs defaultValue="categorias">
      <TabsList className="flex w-full overflow-x-auto sm:w-auto">
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
        <TabsTrigger value="fixas">Contas fixas</TabsTrigger>
        <TabsTrigger value="entidades">Pessoas</TabsTrigger>
        <TabsTrigger value="contas">Contas</TabsTrigger>
        <TabsTrigger value="cartoes">Cartões</TabsTrigger>
      </TabsList>

      <TabsContent value="categorias">
        <CategoriasSection categorias={categorias} />
      </TabsContent>
      <TabsContent value="fixas">
        <RecorrenciasSection
          recorrencias={recorrencias}
          categorias={categorias}
          contas={contas}
          cartoes={cartoes}
        />
      </TabsContent>
      <TabsContent value="entidades">
        <EntidadesSection entidades={entidades} />
      </TabsContent>
      <TabsContent value="contas">
        <ContasSection contas={contas} entidades={entidades} />
      </TabsContent>
      <TabsContent value="cartoes">
        <CartoesSection cartoes={cartoes} entidades={entidades} />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function Toolbar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-body-sm text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** Executa uma action, mostra toast e revalida. Retorna true em sucesso. */
function useAcao() {
  const router = useRouter();
  return async function run(
    action: () => Promise<{ error?: string }>,
    okMsg: string,
    onSuccess?: () => void,
  ): Promise<boolean> {
    const res = await action();
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return false;
    }
    toast.success(okMsg);
    onSuccess?.();
    router.refresh();
    return true;
  };
}

function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ações"
        className="rounded-full p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary focus-visible:opacity-100 group-hover:opacity-100"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={go} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmitRow({
  submitting,
  onCancel,
  label = "Salvar",
}: {
  submitting: boolean;
  onCancel: () => void;
  label?: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Categorias                                                         */
/* ------------------------------------------------------------------ */
const ESSENCIALIDADE_VARIANT: Record<
  Essencialidade,
  "success" | "default" | "warning" | "tech"
> = {
  essencial: "success",
  necessario: "default",
  superfluo: "warning",
  investimento: "tech",
};

function CategoriasSection({ categorias }: { categorias: Categoria[] }) {
  const run = useAcao();
  const [criar, setCriar] = useState(false);
  const [paiPadrao, setPaiPadrao] = useState<string | null>(null);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [arquivando, setArquivando] = useState<Categoria | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const pais = categorias
    .filter((c) => !c.categoria_pai_id)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const filhosPorPai = new Map<string, Categoria[]>();
  for (const c of categorias) {
    if (!c.categoria_pai_id) continue;
    const arr = filhosPorPai.get(c.categoria_pai_id) ?? [];
    arr.push(c);
    filhosPorPai.set(c.categoria_pai_id, arr);
  }
  for (const arr of filhosPorPai.values()) {
    arr.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  }

  function toggle(id: string) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function abrirCriar(pai: string | null) {
    setPaiPadrao(pai);
    setCriar(true);
  }

  return (
    <div className="space-y-3">
      <Toolbar
        label={`${pais.length} categorias · ${categorias.length - pais.length} subcategorias`}
      >
        <Button size="sm" onClick={() => abrirCriar(null)}>
          <Plus className="size-4" /> Nova categoria
        </Button>
      </Toolbar>

      {categorias.length === 0 ? (
        <EmptyState icon={Tag} title="Sem categorias" description="Crie categorias para organizar seus lançamentos." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 px-2 py-1 sm:px-4">
            {pais.map((p) => {
              const filhos = filhosPorPai.get(p.id) ?? [];
              const aberto = abertos.has(p.id);
              return (
                <div key={p.id}>
                  <div className="group flex items-center gap-2 py-3">
                    <button
                      type="button"
                      onClick={() => filhos.length > 0 && toggle(p.id)}
                      className={cn(
                        "flex flex-1 items-center gap-3 text-left",
                        filhos.length === 0 && "cursor-default",
                      )}
                    >
                      <CategoryIcon icone={p.icone} cor={p.cor} size="sm" />
                      <span className="flex-1 truncate text-body-sm font-semibold">{p.nome}</span>
                      {p.essencialidade_padrao && (
                        <Badge variant={ESSENCIALIDADE_VARIANT[p.essencialidade_padrao]} size="sm">
                          {LABEL_ESSENCIALIDADE[p.essencialidade_padrao]}
                        </Badge>
                      )}
                      {p.comportamento !== "basico" && (
                        <Badge variant="accent" size="sm">
                          {LABEL_COMPORTAMENTO[p.comportamento]}
                        </Badge>
                      )}
                      {filhos.length > 0 && (
                        <>
                          <span className="text-caption text-muted-foreground">{filhos.length}</span>
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform",
                              aberto && "rotate-180",
                            )}
                          />
                        </>
                      )}
                    </button>
                    <RowMenu>
                      <DropdownMenuItem onClick={() => setEditando(p)}>
                        <Pencil /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => abrirCriar(p.id)}>
                        <Plus /> Adicionar subcategoria
                      </DropdownMenuItem>
                      <DropdownMenuItem destructive onClick={() => setArquivando(p)}>
                        <Archive /> Arquivar
                      </DropdownMenuItem>
                    </RowMenu>
                  </div>

                  {aberto && filhos.length > 0 && (
                    <ul className="mb-2 ml-6 space-y-1 border-l border-border/70 pl-4">
                      {filhos.map((f) => (
                        <li key={f.id} className="group flex items-center gap-2 py-1.5">
                          <span className="flex-1 truncate text-body-sm text-muted-foreground">{f.nome}</span>
                          {f.essencialidade_padrao && (
                            <Badge variant={ESSENCIALIDADE_VARIANT[f.essencialidade_padrao]} size="sm">
                              {LABEL_ESSENCIALIDADE[f.essencialidade_padrao]}
                            </Badge>
                          )}
                          <RowMenu>
                            <DropdownMenuItem onClick={() => setEditando(f)}>
                              <Pencil /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onClick={() => setArquivando(f)}>
                              <Archive /> Arquivar
                            </DropdownMenuItem>
                          </RowMenu>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <CategoriaDialog categorias={categorias} open={criar} onOpenChange={setCriar} paiPadrao={paiPadrao} />
      <CategoriaDialog
        categorias={categorias}
        categoria={editando}
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
      />
      <ConfirmDialog
        open={!!arquivando}
        onOpenChange={(o) => !o && setArquivando(null)}
        title="Arquivar categoria?"
        description={`"${arquivando?.nome}" e suas subcategorias saem das listas. Os lançamentos antigos são preservados.`}
        confirmLabel="Arquivar"
        onConfirm={async () => {
          if (arquivando) {
            await run(() => arquivarCategoria(arquivando.id), "Categoria arquivada", () => setArquivando(null));
          }
        }}
      />
    </div>
  );
}

function CategoriaDialog({
  categorias,
  categoria,
  paiPadrao,
  open,
  onOpenChange,
}: {
  categorias: Categoria[];
  categoria?: Categoria | null;
  paiPadrao?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const run = useAcao();
  const edit = !!categoria;
  const form = useForm<CategoriaInput>({ resolver: zodResolver(categoriaSchema) });

  useEffect(() => {
    if (!open) return;
    form.reset({
      nome: categoria?.nome ?? "",
      icone: categoria?.icone ?? "🏷️",
      cor: categoria?.cor ?? "#8FA993",
      comportamento: categoria?.comportamento ?? "basico",
      categoria_pai_id: categoria?.categoria_pai_id ?? paiPadrao ?? null,
      essencialidade: categoria?.essencialidade_padrao ?? null,
    });
  }, [open, categoria, paiPadrao, form]);

  const temFilhos = edit && categorias.some((c) => c.categoria_pai_id === categoria!.id);
  const opcoesPai = categorias
    .filter((c) => !c.categoria_pai_id && c.id !== categoria?.id)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  async function onSubmit(v: CategoriaInput) {
    const payload: CategoriaInput = {
      ...v,
      categoria_pai_id: temFilhos ? null : v.categoria_pai_id || null,
      essencialidade: v.essencialidade || null,
    };
    await run(
      () => (edit ? atualizarCategoria(categoria!.id, payload) : criarCategoria(payload)),
      edit ? "Categoria atualizada" : "Categoria criada",
      () => onOpenChange(false),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "Editar categoria" : "Nova categoria"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cat-nome">Nome</Label>
            <Input id="cat-nome" placeholder="Ex.: Streaming" {...form.register("nome")} />
            <FieldError message={form.formState.errors.nome?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-icone">Ícone (emoji)</Label>
              <Input id="cat-icone" maxLength={4} placeholder="🎬" {...form.register("icone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-cor">Cor</Label>
              <input
                id="cat-cor"
                type="color"
                className="h-11 w-full cursor-pointer rounded-md border border-input bg-card p-1"
                {...form.register("cor")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria-pai</Label>
            <Controller
              control={form.control}
              name="categoria_pai_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? "none"}
                  onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                  disabled={temFilhos}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (categoria principal)</SelectItem>
                    {opcoesPai.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icone ? `${c.icone}  ` : ""}
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-caption text-muted-foreground">
              {temFilhos
                ? "Esta categoria tem subcategorias, por isso não pode virar subcategoria."
                : "Deixe em “Nenhuma” para uma categoria principal, ou escolha a pai para criar uma subcategoria."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Essencialidade</Label>
              <Controller
                control={form.control}
                name="essencialidade"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem padrão</SelectItem>
                      {ESSENCIALIDADES.map((e) => (
                        <SelectItem key={e} value={e}>
                          {LABEL_ESSENCIALIDADE[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comportamento</Label>
              <Controller
                control={form.control}
                name="comportamento"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPORTAMENTOS_CATEGORIA.map((c) => (
                        <SelectItem key={c} value={c}>
                          {LABEL_COMPORTAMENTO[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <p className="text-caption text-muted-foreground">
            Projetos e compromissos permitem criar coleções (viagens, compras coletivas).
          </p>
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Pessoas (entidades)                                                */
/* ------------------------------------------------------------------ */
function EntidadesSection({ entidades }: { entidades: Entidade[] }) {
  const run = useAcao();
  const [criar, setCriar] = useState(false);
  const [editando, setEditando] = useState<Entidade | null>(null);
  const [excluindo, setExcluindo] = useState<Entidade | null>(null);

  return (
    <div className="space-y-3">
      <Toolbar label={`${entidades.length} ${entidades.length === 1 ? "pessoa" : "pessoas"}`}>
        <Button size="sm" onClick={() => setCriar(true)}>
          <Plus className="size-4" /> Nova pessoa
        </Button>
      </Toolbar>
      {entidades.length === 0 ? (
        <EmptyState icon={Users} title="Sem pessoas" description="Cadastre membros da família e grupos." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 px-5 py-1">
            {entidades.map((e) => (
              <div key={e.id} className="group flex items-center gap-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  {e.tipo === "grupo" ? <Users className="size-4" /> : <User className="size-4" />}
                </span>
                <span className="flex-1 truncate text-body-sm font-medium">{e.nome}</span>
                <Badge size="sm">{e.tipo === "grupo" ? "Grupo" : "Pessoa"}</Badge>
                <RowMenu>
                  <DropdownMenuItem onClick={() => setEditando(e)}>
                    <Pencil /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={() => setExcluindo(e)}>
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                </RowMenu>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <EntidadeDialog open={criar} onOpenChange={setCriar} />
      <EntidadeDialog
        entidade={editando}
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
      />
      <ConfirmDialog
        open={!!excluindo}
        onOpenChange={(o) => !o && setExcluindo(null)}
        title="Excluir pessoa?"
        description={`"${excluindo?.nome}" será removida. Se for titular de contas ou cartões, remova-os antes.`}
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (excluindo) {
            await run(() => excluirEntidade(excluindo.id), "Pessoa excluída", () => setExcluindo(null));
          }
        }}
      />
    </div>
  );
}

function EntidadeDialog({
  entidade,
  open,
  onOpenChange,
}: {
  entidade?: Entidade | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const run = useAcao();
  const edit = !!entidade;
  const form = useForm<EntidadeInput>({ resolver: zodResolver(entidadeSchema) });

  useEffect(() => {
    if (!open) return;
    form.reset({ nome: entidade?.nome ?? "", tipo: entidade?.tipo ?? "pessoa" });
  }, [open, entidade, form]);

  async function onSubmit(v: EntidadeInput) {
    await run(
      () => (edit ? atualizarEntidade(entidade!.id, v) : criarEntidade(v)),
      edit ? "Cadastro atualizado" : "Cadastro criado",
      () => onOpenChange(false),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "Editar pessoa ou grupo" : "Nova pessoa ou grupo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="ent-nome">Nome</Label>
            <Input id="ent-nome" placeholder="Ex.: Henrique" {...form.register("nome")} />
            <FieldError message={form.formState.errors.nome?.message} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Controller
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoa">Pessoa</SelectItem>
                    <SelectItem value="grupo">Grupo</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Contas                                                             */
/* ------------------------------------------------------------------ */
function ContasSection({ contas, entidades }: { contas: ContaBancaria[]; entidades: Entidade[] }) {
  const run = useAcao();
  const entidadeNome = (id: string | null) => entidades.find((e) => e.id === id)?.nome ?? "—";
  const [criar, setCriar] = useState(false);
  const [editando, setEditando] = useState<ContaBancaria | null>(null);
  const [excluindo, setExcluindo] = useState<ContaBancaria | null>(null);

  return (
    <div className="space-y-3">
      <Toolbar label={`${contas.length} ${contas.length === 1 ? "conta" : "contas"}`}>
        <Button size="sm" onClick={() => setCriar(true)}>
          <Plus className="size-4" /> Nova conta
        </Button>
      </Toolbar>
      {contas.length === 0 ? (
        <EmptyState icon={Landmark} title="Sem contas" description="Adicione contas bancárias para acompanhar saldos." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 px-5 py-1">
            {contas.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Landmark className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium">{c.apelido}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {c.banco} · {LABEL_TIPO_CONTA[c.tipo]} · {entidadeNome(c.titular_id)}
                  </p>
                </div>
                <RowMenu>
                  <DropdownMenuItem onClick={() => setEditando(c)}>
                    <Pencil /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={() => setExcluindo(c)}>
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                </RowMenu>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ContaDialog entidades={entidades} open={criar} onOpenChange={setCriar} />
      <ContaDialog
        entidades={entidades}
        conta={editando}
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
      />
      <ConfirmDialog
        open={!!excluindo}
        onOpenChange={(o) => !o && setExcluindo(null)}
        title="Excluir conta?"
        description={`"${excluindo?.apelido}" será removida. Os lançamentos ligados a ela ficam sem conta.`}
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (excluindo) {
            await run(() => excluirConta(excluindo.id), "Conta excluída", () => setExcluindo(null));
          }
        }}
      />
    </div>
  );
}

function ContaDialog({
  entidades,
  conta,
  open,
  onOpenChange,
}: {
  entidades: Entidade[];
  conta?: ContaBancaria | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const run = useAcao();
  const edit = !!conta;
  const form = useForm<ContaInput>({ resolver: zodResolver(contaSchema) });

  useEffect(() => {
    if (!open) return;
    form.reset({
      banco: conta?.banco ?? "",
      apelido: conta?.apelido ?? "",
      tipo: conta?.tipo ?? "corrente",
      titular_id: conta?.titular_id ?? undefined,
      agencia: conta?.agencia ?? undefined,
      numero: conta?.numero ?? undefined,
      eh_conta_compartilhada: conta?.eh_conta_compartilhada ?? false,
    });
  }, [open, conta, form]);

  async function onSubmit(v: ContaInput) {
    await run(
      () => (edit ? atualizarConta(conta!.id, v) : criarConta(v)),
      edit ? "Conta atualizada" : "Conta criada",
      () => onOpenChange(false),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar conta" : "Nova conta bancária"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="conta-banco">Banco</Label>
              <Input id="conta-banco" placeholder="Ex.: Nubank" {...form.register("banco")} />
              <FieldError message={form.formState.errors.banco?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conta-apelido">Apelido</Label>
              <Input id="conta-apelido" placeholder="Conta principal" {...form.register("apelido")} />
              <FieldError message={form.formState.errors.apelido?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Titular</Label>
            <Controller
              control={form.control}
              name="titular_id"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar titular" />
                  </SelectTrigger>
                  <SelectContent>
                    {entidades.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={form.formState.errors.titular_id?.message} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Controller
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONTA_BANCARIA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {LABEL_TIPO_CONTA[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="conta-ag">Agência (opcional)</Label>
              <Input id="conta-ag" placeholder="0001" {...form.register("agencia")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conta-num">Número (opcional)</Label>
              <Input id="conta-num" placeholder="12345-6" {...form.register("numero")} />
            </div>
          </div>
          <Controller
            control={form.control}
            name="eh_conta_compartilhada"
            render={({ field }) => (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <Label htmlFor="conta-compart" className="cursor-pointer">
                  Conta compartilhada da família
                </Label>
                <Switch id="conta-compart" checked={!!field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Cartões                                                            */
/* ------------------------------------------------------------------ */
function CartoesSection({ cartoes, entidades }: { cartoes: Cartao[]; entidades: Entidade[] }) {
  const run = useAcao();
  const entidadeNome = (id: string | null) => entidades.find((e) => e.id === id)?.nome ?? "—";
  const [criar, setCriar] = useState(false);
  const [editando, setEditando] = useState<Cartao | null>(null);
  const [excluindo, setExcluindo] = useState<Cartao | null>(null);

  return (
    <div className="space-y-3">
      <Toolbar label={`${cartoes.length} ${cartoes.length === 1 ? "cartão" : "cartões"}`}>
        <Button size="sm" onClick={() => setCriar(true)}>
          <Plus className="size-4" /> Novo cartão
        </Button>
      </Toolbar>
      {cartoes.length === 0 ? (
        <EmptyState icon={CreditCard} title="Sem cartões" description="Cadastre cartões de crédito para conciliar faturas." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 px-5 py-1">
            {cartoes.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <CreditCard className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium">{c.apelido}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {c.banco}
                    {c.ultimos_digitos ? ` ·· ${c.ultimos_digitos}` : ""} · {entidadeNome(c.titular_id)}
                  </p>
                </div>
                <RowMenu>
                  <DropdownMenuItem onClick={() => setEditando(c)}>
                    <Pencil /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={() => setExcluindo(c)}>
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                </RowMenu>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CartaoDialog entidades={entidades} open={criar} onOpenChange={setCriar} />
      <CartaoDialog
        entidades={entidades}
        cartao={editando}
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
      />
      <ConfirmDialog
        open={!!excluindo}
        onOpenChange={(o) => !o && setExcluindo(null)}
        title="Excluir cartão?"
        description={`"${excluindo?.apelido}" será removido. As faturas dele são apagadas e os lançamentos ficam sem cartão.`}
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (excluindo) {
            await run(() => excluirCartao(excluindo.id), "Cartão excluído", () => setExcluindo(null));
          }
        }}
      />
    </div>
  );
}

function CartaoDialog({
  entidades,
  cartao,
  open,
  onOpenChange,
}: {
  entidades: Entidade[];
  cartao?: Cartao | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const run = useAcao();
  const edit = !!cartao;
  const form = useForm<CartaoInput>({ resolver: zodResolver(cartaoSchema) });

  useEffect(() => {
    if (!open) return;
    form.reset({
      banco: cartao?.banco ?? "",
      apelido: cartao?.apelido ?? "",
      bandeira: cartao?.bandeira ?? undefined,
      ultimos_digitos: cartao?.ultimos_digitos ?? undefined,
      dia_fechamento: cartao?.dia_fechamento ?? undefined,
      dia_vencimento: cartao?.dia_vencimento ?? undefined,
      limite: cartao?.limite ?? undefined,
      titular_id: cartao?.titular_id ?? undefined,
    });
  }, [open, cartao, form]);

  async function onSubmit(v: CartaoInput) {
    await run(
      () => (edit ? atualizarCartao(cartao!.id, v) : criarCartao(v)),
      edit ? "Cartão atualizado" : "Cartão criado",
      () => onOpenChange(false),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar cartão" : "Novo cartão"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cart-apelido">Apelido</Label>
              <Input id="cart-apelido" placeholder="Cartão Nubank" {...form.register("apelido")} />
              <FieldError message={form.formState.errors.apelido?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cart-banco">Banco</Label>
              <Input id="cart-banco" placeholder="Nubank" {...form.register("banco")} />
              <FieldError message={form.formState.errors.banco?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Titular</Label>
            <Controller
              control={form.control}
              name="titular_id"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar titular" />
                  </SelectTrigger>
                  <SelectContent>
                    {entidades.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={form.formState.errors.titular_id?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cart-band">Bandeira</Label>
              <Input id="cart-band" placeholder="Visa" {...form.register("bandeira")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cart-dig">Últimos 4 dígitos</Label>
              <Input id="cart-dig" maxLength={4} placeholder="1234" {...form.register("ultimos_digitos")} />
              <FieldError message={form.formState.errors.ultimos_digitos?.message} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cart-fech">Fechamento</Label>
              <Input id="cart-fech" type="number" min={1} max={31} placeholder="20" {...form.register("dia_fechamento")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cart-venc">Vencimento</Label>
              <Input id="cart-venc" type="number" min={1} max={31} placeholder="28" {...form.register("dia_vencimento")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cart-lim">Limite</Label>
              <Input id="cart-lim" type="number" min={0} step="0.01" placeholder="5000" {...form.register("limite")} />
            </div>
          </div>
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Contas fixas (recorrências)                                         */
/* ------------------------------------------------------------------ */
function RecorrenciasSection({
  recorrencias,
  categorias,
  contas,
  cartoes,
}: {
  recorrencias: Recorrencia[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: Cartao[];
}) {
  const run = useAcao();
  const catNome = (id: string | null) => categorias.find((c) => c.id === id)?.nome;
  const [criar, setCriar] = useState(false);
  const [editando, setEditando] = useState<Recorrencia | null>(null);
  const [excluindo, setExcluindo] = useState<Recorrencia | null>(null);

  return (
    <div className="space-y-3">
      <Toolbar label={`${recorrencias.length} ${recorrencias.length === 1 ? "conta fixa" : "contas fixas"}`}>
        <Button size="sm" onClick={() => setCriar(true)}>
          <Plus className="size-4" /> Nova conta fixa
        </Button>
      </Toolbar>
      {recorrencias.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Sem contas fixas"
          description="Cadastre aluguel, assinaturas e mensalidades — o lançamento entra sozinho no vencimento."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 px-5 py-1">
            {recorrencias.map((r) => (
              <div key={r.id} className={cn("group flex items-center gap-3 py-3", !r.ativa && "opacity-60")}>
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Repeat className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium">
                    {r.descricao}
                    {!r.ativa && <span className="text-muted-foreground"> · pausada</span>}
                  </p>
                  <p className="truncate text-caption text-muted-foreground">
                    {LABEL_FREQUENCIA[r.frequencia]} · {formatBRL(r.valor_previsto)}
                    {catNome(r.categoria_id) ? ` · ${catNome(r.categoria_id)}` : ""}
                    {r.ativa && r.proxima_geracao ? ` · próx. ${formatDate(r.proxima_geracao)}` : ""}
                    {r.data_fim ? ` · até ${formatDate(r.data_fim)}` : " · sem término"}
                  </p>
                </div>
                {r.tipo === "receita" && (
                  <Badge variant="success" size="sm">
                    Receita
                  </Badge>
                )}
                <RowMenu>
                  <DropdownMenuItem onClick={() => setEditando(r)}>
                    <Pencil /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      run(
                        () => alternarRecorrencia(r.id, !r.ativa),
                        r.ativa ? "Conta fixa pausada" : "Conta fixa retomada",
                      )
                    }
                  >
                    {r.ativa ? (
                      <>
                        <Pause /> Pausar
                      </>
                    ) : (
                      <>
                        <Play /> Retomar
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={() => setExcluindo(r)}>
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                </RowMenu>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <RecorrenciaDialog categorias={categorias} contas={contas} cartoes={cartoes} open={criar} onOpenChange={setCriar} />
      <RecorrenciaDialog
        categorias={categorias}
        contas={contas}
        cartoes={cartoes}
        recorrencia={editando}
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
      />
      <ConfirmDialog
        open={!!excluindo}
        onOpenChange={(o) => !o && setExcluindo(null)}
        title="Excluir conta fixa?"
        description={`"${excluindo?.descricao}" para de gerar lançamentos. Os que já foram lançados são mantidos.`}
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (excluindo) {
            await run(() => excluirRecorrencia(excluindo.id), "Conta fixa excluída", () => setExcluindo(null));
          }
        }}
      />
    </div>
  );
}

function RecorrenciaDialog({
  categorias,
  contas,
  cartoes,
  recorrencia,
  open,
  onOpenChange,
}: {
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: Cartao[];
  recorrencia?: Recorrencia | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const run = useAcao();
  const edit = !!recorrencia;
  const form = useForm<RecorrenciaInput>({ resolver: zodResolver(recorrenciaSchema) });

  useEffect(() => {
    if (!open) return;
    form.reset({
      descricao: recorrencia?.descricao ?? "",
      tipo: recorrencia?.tipo ?? "despesa",
      valor_previsto: recorrencia?.valor_previsto ?? undefined,
      frequencia: recorrencia?.frequencia ?? "mensal",
      data_inicio: recorrencia?.data_inicio ?? new Date().toISOString().slice(0, 10),
      data_fim: recorrencia?.data_fim ?? undefined,
      categoria_id: recorrencia?.categoria_id ?? undefined,
      meio_pagamento: recorrencia?.meio_pagamento ?? undefined,
      cartao_id: recorrencia?.cartao_id ?? undefined,
      conta_id: recorrencia?.conta_id ?? undefined,
      retroativo: false,
    });
  }, [open, recorrencia, form]);

  const meio = form.watch("meio_pagamento");
  const mostraCartao = meio === "cartao_credito" || meio === "cartao_debito";
  const dataInicio = form.watch("data_inicio");
  // Só faz sentido oferecer "lançar passadas" ao criar algo que começou no passado.
  const inicioNoPassado = !edit && !!dataInicio && dataInicio < new Date().toISOString().slice(0, 10);

  async function onSubmit(v: RecorrenciaInput) {
    // Mantém só o vínculo coerente com o meio (cartão XOR conta).
    const payload: RecorrenciaInput = {
      ...v,
      cartao_id: mostraCartao ? v.cartao_id : undefined,
      conta_id: mostraCartao ? undefined : v.conta_id,
    };
    await run(
      () => (edit ? atualizarRecorrencia(recorrencia!.id, payload) : criarRecorrencia(payload)),
      edit ? "Conta fixa atualizada" : "Conta fixa criada",
      () => onOpenChange(false),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar conta fixa" : "Nova conta fixa"}</DialogTitle>
          <DialogDescription>Lançada automaticamente no vencimento, conforme a frequência.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Controller
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <Tabs value={field.value} onValueChange={field.onChange}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="despesa">Despesa</TabsTrigger>
                  <TabsTrigger value="receita">Receita</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-valor">Valor</Label>
              <Controller
                control={form.control}
                name="valor_previsto"
                render={({ field }) => (
                  <MoneyInput id="rec-valor" value={field.value} onChange={field.onChange} />
                )}
              />
              <FieldError message={form.formState.errors.valor_previsto?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Controller
                control={form.control}
                name="frequencia"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIAS_RECORRENCIA.map((f) => (
                        <SelectItem key={f} value={f}>
                          {LABEL_FREQUENCIA[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-desc">Descrição</Label>
            <Input id="rec-desc" placeholder="Ex.: Aluguel, Netflix, Escola" {...form.register("descricao")} />
            <FieldError message={form.formState.errors.descricao?.message} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Controller
              control={form.control}
              name="categoria_id"
              render={({ field }) => (
                <CategoriaPicker
                  categorias={categorias}
                  value={field.value ?? undefined}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-inicio">Início / 1º vencimento</Label>
              <Input id="rec-inicio" type="date" {...form.register("data_inicio")} />
              <FieldError message={form.formState.errors.data_inicio?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-fim">Fim (opcional)</Label>
              <Input id="rec-fim" type="date" {...form.register("data_fim")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Meio de pagamento</Label>
              <Controller
                control={form.control}
                name="meio_pagamento"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEIOS_PAGAMENTO.map((m) => (
                        <SelectItem key={m} value={m}>
                          {LABEL_MEIO_PAGAMENTO[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{mostraCartao ? "Cartão" : "Conta"}</Label>
              {mostraCartao ? (
                <Controller
                  control={form.control}
                  name="cartao_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {cartoes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.apelido}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Controller
                  control={form.control}
                  name="conta_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {contas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.apelido}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </div>
          </div>
          {inicioNoPassado && (
            <Controller
              control={form.control}
              name="retroativo"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="rec-retro">Lançar ocorrências passadas</Label>
                    <p className="text-caption text-muted-foreground">
                      Cria também os lançamentos desde a data de início. Desligado, a conta fixa
                      vale só daqui pra frente.
                    </p>
                  </div>
                  <Switch
                    id="rec-retro"
                    checked={!!field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          )}
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
