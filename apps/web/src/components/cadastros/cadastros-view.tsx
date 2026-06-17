"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  CreditCard,
  Landmark,
  Loader2,
  Plus,
  Tag,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "@/components/ui/sonner";
import {
  cartaoSchema,
  categoriaSchema,
  contaSchema,
  entidadeSchema,
  type CartaoInput,
  type CategoriaInput,
  type ContaInput,
  type EntidadeInput,
} from "@/lib/schemas/cadastros";
import {
  COMPORTAMENTOS_CATEGORIA,
  LABEL_COMPORTAMENTO,
  LABEL_ESSENCIALIDADE,
  LABEL_TIPO_CONTA,
  TIPOS_CONTA_BANCARIA,
  type Cartao,
  type Categoria,
  type ContaBancaria,
  type Entidade,
  type Essencialidade,
} from "@/lib/types/db";
import {
  criarCartao,
  criarCategoria,
  criarConta,
  criarEntidade,
} from "@/app/app/cadastros/actions";

export function CadastrosView({
  entidades,
  categorias,
  contas,
  cartoes,
}: {
  entidades: Entidade[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: Cartao[];
}) {
  const entidadeNome = (id: string | null) => entidades.find((e) => e.id === id)?.nome ?? "—";

  return (
    <Tabs defaultValue="categorias">
      <TabsList className="flex w-full overflow-x-auto sm:w-auto">
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
        <TabsTrigger value="entidades">Pessoas</TabsTrigger>
        <TabsTrigger value="contas">Contas</TabsTrigger>
        <TabsTrigger value="cartoes">Cartões</TabsTrigger>
      </TabsList>

      {/* ---- Categorias ---- */}
      <TabsContent value="categorias" className="space-y-3">
        <Toolbar
          label={`${categorias.filter((c) => !c.categoria_pai_id).length} categorias · ${
            categorias.filter((c) => c.categoria_pai_id).length
          } subcategorias`}
        >
          <NovaCategoriaDialog />
        </Toolbar>
        {categorias.length === 0 ? (
          <EmptyState icon={Tag} title="Sem categorias" description="Crie categorias para organizar seus lançamentos." />
        ) : (
          <CategoriasLista categorias={categorias} />
        )}
      </TabsContent>

      {/* ---- Entidades ---- */}
      <TabsContent value="entidades" className="space-y-3">
        <Toolbar count={entidades.length}>
          <NovaEntidadeDialog />
        </Toolbar>
        {entidades.length === 0 ? (
          <EmptyState icon={Users} title="Sem pessoas" description="Cadastre membros da família e grupos." />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/70 px-5 py-1">
              {entidades.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    {e.tipo === "grupo" ? <Users className="size-4" /> : <User className="size-4" />}
                  </span>
                  <span className="flex-1 truncate text-body-sm font-medium">{e.nome}</span>
                  <Badge size="sm">{e.tipo === "grupo" ? "Grupo" : "Pessoa"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* ---- Contas ---- */}
      <TabsContent value="contas" className="space-y-3">
        <Toolbar count={contas.length}>
          <NovaContaDialog entidades={entidades} />
        </Toolbar>
        {contas.length === 0 ? (
          <EmptyState icon={Landmark} title="Sem contas" description="Adicione contas bancárias para acompanhar saldos." />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/70 px-5 py-1">
              {contas.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Landmark className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">{c.apelido}</p>
                    <p className="truncate text-caption text-muted-foreground">
                      {c.banco} · {LABEL_TIPO_CONTA[c.tipo]} · {entidadeNome(c.titular_id)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* ---- Cartões ---- */}
      <TabsContent value="cartoes" className="space-y-3">
        <Toolbar count={cartoes.length}>
          <NovoCartaoDialog entidades={entidades} />
        </Toolbar>
        {cartoes.length === 0 ? (
          <EmptyState icon={CreditCard} title="Sem cartões" description="Cadastre cartões de crédito para conciliar faturas." />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/70 px-5 py-1">
              {cartoes.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3">
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
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                            */
/* ------------------------------------------------------------------ */
function Toolbar({
  count,
  label,
  children,
}: {
  count?: number;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-body-sm text-muted-foreground">
        {label ?? `${count ?? 0} ${count === 1 ? "item" : "itens"}`}
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de categorias — hierárquica (pai → subcategorias)            */
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

function CategoriasLista({ categorias }: { categorias: Categoria[] }) {
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

  return (
    <Card>
      <CardContent className="divide-y divide-border/70 px-2 py-1 sm:px-4">
        {pais.map((p) => {
          const filhos = filhosPorPai.get(p.id) ?? [];
          const aberto = abertos.has(p.id);
          return (
            <div key={p.id}>
              <button
                type="button"
                onClick={() => filhos.length > 0 && toggle(p.id)}
                className={cn(
                  "flex w-full items-center gap-3 py-3 text-left",
                  filhos.length === 0 && "cursor-default",
                )}
              >
                <CategoryIcon icone={p.icone} cor={p.cor} size="sm" />
                <span className="flex-1 truncate text-body-sm font-semibold">{p.nome}</span>
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
              {aberto && filhos.length > 0 && (
                <ul className="mb-2 ml-6 space-y-1 border-l border-border/70 pl-4">
                  {filhos.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 truncate text-body-sm text-muted-foreground">
                        {f.nome}
                      </span>
                      {f.essencialidade_padrao && (
                        <Badge variant={ESSENCIALIDADE_VARIANT[f.essencialidade_padrao]} size="sm">
                          {LABEL_ESSENCIALIDADE[f.essencialidade_padrao]}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function useCrud<T>(onDone: () => void) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function run(action: (v: T) => Promise<{ error?: string }>, values: T, ok: string) {
    const res = await action(values);
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return false;
    }
    toast.success(ok);
    setOpen(false);
    onDone();
    router.refresh();
    return true;
  }
  return { open, setOpen, run };
}

/* ------------------------------------------------------------------ */
/* Nova categoria                                                     */
/* ------------------------------------------------------------------ */
function NovaCategoriaDialog() {
  const form = useForm<CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { comportamento: "basico", cor: "#8FA993", icone: "🏷️" },
  });
  const { open, setOpen, run } = useCrud<CategoriaInput>(() => form.reset({ comportamento: "basico", cor: "#8FA993", icone: "🏷️" }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Nova categoria
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => run(criarCategoria, v, "Categoria criada"))}
          className="space-y-4"
          noValidate
        >
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
            <p className="text-caption text-muted-foreground">
              Projetos e compromissos permitem criar coleções (viagens, compras coletivas).
            </p>
          </div>
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Nova entidade                                                      */
/* ------------------------------------------------------------------ */
function NovaEntidadeDialog() {
  const form = useForm<EntidadeInput>({
    resolver: zodResolver(entidadeSchema),
    defaultValues: { tipo: "pessoa" },
  });
  const { open, setOpen, run } = useCrud<EntidadeInput>(() => form.reset({ tipo: "pessoa" }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Nova pessoa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova pessoa ou grupo</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => run(criarEntidade, v, "Cadastro criado"))}
          className="space-y-4"
          noValidate
        >
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
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Nova conta                                                         */
/* ------------------------------------------------------------------ */
function NovaContaDialog({ entidades }: { entidades: Entidade[] }) {
  const form = useForm<ContaInput>({
    resolver: zodResolver(contaSchema),
    defaultValues: { tipo: "corrente", eh_conta_compartilhada: false },
  });
  const { open, setOpen, run } = useCrud<ContaInput>(() =>
    form.reset({ tipo: "corrente", eh_conta_compartilhada: false }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Nova conta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conta bancária</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => run(criarConta, v, "Conta criada"))}
          className="space-y-4"
          noValidate
        >
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
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Novo cartão                                                        */
/* ------------------------------------------------------------------ */
function NovoCartaoDialog({ entidades }: { entidades: Entidade[] }) {
  const form = useForm<CartaoInput>({ resolver: zodResolver(cartaoSchema) });
  const { open, setOpen, run } = useCrud<CartaoInput>(() => form.reset({}));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Novo cartão
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo cartão</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => run(criarCartao, v, "Cartão criado"))}
          className="space-y-4"
          noValidate
        >
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
          <SubmitRow submitting={form.formState.isSubmitting} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitRow({ submitting, onCancel }: { submitting: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Salvar
      </Button>
    </div>
  );
}
