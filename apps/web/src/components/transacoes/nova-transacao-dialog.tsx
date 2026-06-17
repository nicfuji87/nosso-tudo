"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "@/components/ui/sonner";
import { MoneyInput } from "./money-input";
import { CategoriaPicker } from "./categoria-picker";
import { FieldError } from "@/components/auth/field-error";
import { formatBRL } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { transacaoSchema, type TransacaoInput } from "@/lib/schemas/transacao";
import { LABEL_MEIO_PAGAMENTO, MEIOS_PAGAMENTO } from "@/lib/types/db";
import type { Cartao, Categoria, Entidade } from "@/lib/types/db";
import { criarTransacao } from "@/app/app/transacoes/actions";

const hoje = () => new Date().toISOString().slice(0, 10);

export function NovaTransacaoDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [entidades, setEntidades] = useState<Entidade[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransacaoInput>({
    resolver: zodResolver(transacaoSchema),
    defaultValues: { tipo: "despesa", data_transacao: hoje(), tags: [], parcelas: 1 },
  });

  const meio = watch("meio_pagamento");
  const mostraCartao = meio === "cartao_credito" || meio === "cartao_debito";
  const tipo = watch("tipo");
  const valorTotal = watch("valor") ?? 0;
  const parcelas = Math.max(1, Math.floor(Number(watch("parcelas")) || 1));

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const supabase = createClient();
      const [c, e, ca] = await Promise.all([
        supabase.from("categorias").select("*").eq("ativa", true).order("ordem"),
        supabase.from("entidades").select("*").eq("ativa", true).order("nome"),
        supabase.from("cartoes").select("*").eq("ativo", true).order("apelido"),
      ]);
      setCategorias((c.data as Categoria[] | null) ?? []);
      setEntidades((e.data as Entidade[] | null) ?? []);
      setCartoes((ca.data as Cartao[] | null) ?? []);
      setLoaded(true);
    })();
  }, [open, loaded]);

  async function onSubmit(values: TransacaoInput) {
    const res = await criarTransacao(values);
    if (res.error) {
      toast.error("Erro ao salvar", { description: res.error });
      return;
    }
    toast.success(
      values.parcelas && values.parcelas > 1 ? `${values.parcelas} parcelas registradas!` : "Transação registrada!",
    );
    reset({ tipo: values.tipo, data_transacao: hoje(), tags: [], parcelas: 1 });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova transação</DialogTitle>
          <DialogDescription>Registre um gasto ou receita em segundos.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Tipo */}
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

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor</Label>
              <Controller
                control={control}
                name="valor"
                render={({ field }) => (
                  <MoneyInput id="valor" value={field.value} onChange={field.onChange} autoFocus />
                )}
              />
              <FieldError message={errors.valor?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data">Data</Label>
              <Input id="data" type="date" {...register("data_transacao")} />
              <FieldError message={errors.data_transacao?.message} />
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Input id="descricao" placeholder="Ex.: Compras da semana" {...register("descricao")} />
            <FieldError message={errors.descricao?.message} />
          </div>

          {/* Categoria */}
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

          {/* Estabelecimento */}
          <div className="space-y-1.5">
            <Label htmlFor="estab">Estabelecimento</Label>
            <Input id="estab" placeholder="Ex.: Pão de Açúcar" {...register("estabelecimento")} />
          </div>

          {/* Contexto / Evento */}
          <div className="space-y-1.5">
            <Label htmlFor="contexto">Contexto / Evento (opcional)</Label>
            <Input
              id="contexto"
              placeholder="Ex.: Passeio em família, Compra do mês"
              {...register("contexto")}
            />
          </div>

          {/* Meio de pagamento + quem se beneficiou */}
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

          {mostraCartao && (
            <div className="space-y-1.5">
              <Label>Cartão</Label>
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
            </div>
          )}

          {/* Parcelamento (só despesa) */}
          {tipo === "despesa" && (
            <div className="space-y-1.5">
              <Label htmlFor="parcelas">Parcelas</Label>
              <Input id="parcelas" type="number" min={1} max={60} placeholder="1" {...register("parcelas")} />
              {parcelas > 1 && valorTotal > 0 ? (
                <p className="text-caption text-muted-foreground">
                  {parcelas}× de aprox. {formatBRL(valorTotal / parcelas)} · um lançamento por mês a partir da data. O
                  valor acima é o total.
                </p>
              ) : (
                <p className="text-caption text-muted-foreground">1 = à vista.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
