"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MoneyInput } from "./money-input";
import { CategoriaPicker } from "./categoria-picker";
import { EventoCombobox } from "./evento-combobox";
import { FieldError } from "@/components/auth/field-error";
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import { transacaoSchema, type TransacaoInput } from "@/lib/schemas/transacao";
import { atualizarTransacao, carregarTransacaoEditavel } from "@/app/app/transacoes/actions";
import { carregarPropostaEditavel, confirmarTransacaoComEdicao } from "@/app/app/nia/actions";
import {
  LABEL_MEIO_PAGAMENTO,
  MEIOS_PAGAMENTO,
  type Cartao,
  type Categoria,
  type ContaBancaria,
  type Entidade,
} from "@/lib/types/db";

export function TransacaoEditSheet({
  id,
  onClose,
  proposta = false,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  /** true = `id` é uma proposta da Nia (nia_acoes); salvar confirma com edição. */
  proposta?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [entidades, setEntidades] = useState<Entidade[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [eventos, setEventos] = useState<{ id: string; nome: string }[]>([]);

  const { register, handleSubmit, control, watch, reset, formState } = useForm<TransacaoInput>({
    resolver: zodResolver(transacaoSchema),
  });
  const { errors, isSubmitting } = formState;
  const meio = watch("meio_pagamento");
  const mostraCartao = meio === "cartao_credito" || meio === "cartao_debito";

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setCarregando(true);
    (async () => {
      const supabase = createClient();
      const [tx, c, e, ca, co, ev] = await Promise.all([
        proposta ? carregarPropostaEditavel(id) : carregarTransacaoEditavel(id),
        supabase.from("categorias").select("*").eq("ativa", true).order("ordem"),
        supabase.from("entidades").select("*").eq("ativa", true).order("nome"),
        supabase.from("cartoes").select("*").eq("ativo", true).order("apelido"),
        supabase.from("contas_bancarias").select("*").eq("ativa", true).order("apelido"),
        supabase.from("contextos").select("id, nome").eq("arquivado", false).order("nome"),
      ]);
      if (!vivo) return;
      setCategorias((c.data as Categoria[] | null) ?? []);
      setEntidades((e.data as Entidade[] | null) ?? []);
      setCartoes((ca.data as Cartao[] | null) ?? []);
      setContas((co.data as ContaBancaria[] | null) ?? []);
      setEventos((ev.data as { id: string; nome: string }[] | null) ?? []);
      if (tx) {
        reset({
          tipo: tx.tipo,
          descricao: tx.descricao,
          valor: tx.valor,
          data_transacao: tx.data_transacao,
          categoria_id: tx.categoria_id || undefined,
          meio_pagamento: tx.meio_pagamento,
          cartao_id: tx.cartao_id || undefined,
          conta_id: tx.conta_id || undefined,
          beneficiario_id: tx.beneficiario_id || undefined,
          estabelecimento: tx.estabelecimento || undefined,
          contexto: tx.contexto || undefined,
          observacoes: tx.observacoes || undefined,
          tags: [],
        });
      }
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [id, reset, proposta]);

  async function onSubmit(values: TransacaoInput) {
    if (!id) return;
    const res = proposta
      ? await confirmarTransacaoComEdicao(id, values)
      : await atualizarTransacao(id, values);
    if (res.error) {
      toast.error("Erro ao salvar", { description: res.error });
      return;
    }
    toast.success(proposta ? "Lançado!" : "Transação atualizada");
    onClose();
    onSaved?.();
    router.refresh();
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader className="pr-8">
          <SheetTitle>{proposta ? "Conferir e ajustar" : "Editar transação"}</SheetTitle>
        </SheetHeader>

        {carregando ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
            <Controller
              control={control}
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
                <Label htmlFor="ed-valor">Valor</Label>
                <Controller
                  control={control}
                  name="valor"
                  render={({ field }) => <MoneyInput id="ed-valor" value={field.value} onChange={field.onChange} />}
                />
                <FieldError message={errors.valor?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-data">Data</Label>
                <Input id="ed-data" type="date" {...register("data_transacao")} />
                <FieldError message={errors.data_transacao?.message} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ed-desc">Descrição</Label>
              <Input id="ed-desc" {...register("descricao")} />
              <FieldError message={errors.descricao?.message} />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Controller
                control={control}
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

            <div className="space-y-1.5">
              <Label htmlFor="ed-estab">Estabelecimento</Label>
              <Input id="ed-estab" {...register("estabelecimento")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meio de pagamento</Label>
                <Controller
                  control={control}
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
                <Label>Quem se beneficiou</Label>
                <Controller
                  control={control}
                  name="beneficiario_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
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
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{mostraCartao ? "Cartão" : "Conta"}</Label>
              {mostraCartao ? (
                <Controller
                  control={control}
                  name="cartao_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar cartão" />
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
                  control={control}
                  name="conta_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar conta" />
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

            <div className="space-y-1.5">
              <Label htmlFor="ed-ctx">Evento / contexto (opcional)</Label>
              <Controller
                control={control}
                name="contexto"
                render={({ field }) => (
                  <EventoCombobox
                    id="ed-ctx"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    eventos={eventos}
                    placeholder="Ex.: Passeio em família"
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ed-obs">Observações (opcional)</Label>
              <Input id="ed-obs" {...register("observacoes")} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {proposta ? "Salvar e lançar" : "Salvar"}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
