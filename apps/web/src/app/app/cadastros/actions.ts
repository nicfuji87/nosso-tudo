"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/auth";
import { normalizarTexto } from "@/lib/normalize";
import { primeiraGeracao } from "@/lib/recorrencias";
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

function revalidar() {
  revalidatePath("/app/cadastros");
  revalidatePath("/app");
  revalidatePath("/app/transacoes");
}

/** Dia do mês (1..31) extraído de uma data ISO. */
function diaDe(iso: string): number {
  return Number(iso.slice(8, 10)) || 1;
}

export async function criarEntidade(input: EntidadeInput): Promise<{ error?: string }> {
  const parsed = entidadeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase.from("entidades").insert({
    workspace_id: ctx.workspaceId,
    nome: parsed.data.nome,
    tipo: parsed.data.tipo,
    cor: parsed.data.cor ?? null,
    icone: parsed.data.icone ?? null,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "Já existe uma entidade com esse nome." : "Não foi possível salvar.",
    };
  }
  revalidar();
  return {};
}

export async function criarCategoria(input: CategoriaInput): Promise<{ error?: string }> {
  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const slug = `${normalizarTexto(parsed.data.nome).replace(/ /g, "-")}-${Date.now().toString(36)}`;
  const { error } = await supabase.from("categorias").insert({
    workspace_id: ctx.workspaceId,
    nome: parsed.data.nome,
    slug,
    icone: parsed.data.icone ?? null,
    cor: parsed.data.cor ?? null,
    comportamento: parsed.data.comportamento,
    categoria_pai_id: parsed.data.categoria_pai_id ?? null,
    essencialidade_padrao: parsed.data.essencialidade ?? null,
  });
  if (error) return { error: "Não foi possível salvar a categoria." };
  revalidar();
  return {};
}

export async function atualizarCategoria(
  id: string,
  input: CategoriaInput,
): Promise<{ error?: string }> {
  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  // Uma categoria não pode ser pai de si mesma.
  if (parsed.data.categoria_pai_id === id) return { error: "Uma categoria não pode ser a própria pai." };

  const supabase = createClient();
  const { error } = await supabase
    .from("categorias")
    .update({
      nome: parsed.data.nome,
      icone: parsed.data.icone ?? null,
      cor: parsed.data.cor ?? null,
      comportamento: parsed.data.comportamento,
      categoria_pai_id: parsed.data.categoria_pai_id ?? null,
      essencialidade_padrao: parsed.data.essencialidade ?? null,
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível atualizar a categoria." };
  revalidar();
  return {};
}

/**
 * Arquiva a categoria (ativa=false) e suas subcategorias. Preferimos arquivar a
 * excluir: a categoria é referenciada por coleções (RESTRICT) e orçamentos
 * (CASCADE), então apagar quebraria/levaria junto histórico — arquivar só a tira
 * das listas, preservando os lançamentos passados.
 */
export async function arquivarCategoria(id: string): Promise<{ error?: string }> {
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("categorias")
    .update({ ativa: false })
    .eq("workspace_id", ctx.workspaceId)
    .or(`id.eq.${id},categoria_pai_id.eq.${id}`);
  if (error) return { error: "Não foi possível arquivar a categoria." };
  revalidar();
  return {};
}

export async function criarConta(input: ContaInput): Promise<{ error?: string }> {
  const parsed = contaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase.from("contas_bancarias").insert({
    workspace_id: ctx.workspaceId,
    titular_id: parsed.data.titular_id,
    banco: parsed.data.banco,
    apelido: parsed.data.apelido,
    tipo: parsed.data.tipo,
    agencia: parsed.data.agencia ?? null,
    numero: parsed.data.numero ?? null,
    eh_conta_compartilhada: parsed.data.eh_conta_compartilhada,
  });
  if (error) return { error: "Não foi possível salvar a conta." };
  revalidar();
  return {};
}

export async function criarCartao(input: CartaoInput): Promise<{ error?: string }> {
  const parsed = cartaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase.from("cartoes").insert({
    workspace_id: ctx.workspaceId,
    titular_id: parsed.data.titular_id,
    banco: parsed.data.banco,
    apelido: parsed.data.apelido,
    bandeira: parsed.data.bandeira ?? null,
    ultimos_digitos: parsed.data.ultimos_digitos ?? null,
    dia_fechamento: parsed.data.dia_fechamento ?? null,
    dia_vencimento: parsed.data.dia_vencimento ?? null,
    limite: parsed.data.limite ?? null,
  });
  if (error) return { error: "Não foi possível salvar o cartão." };
  revalidar();
  return {};
}

/* ------------------------------------------------------------------ */
/* Atualizar / excluir                                                 */
/* ------------------------------------------------------------------ */

export async function atualizarEntidade(id: string, input: EntidadeInput): Promise<{ error?: string }> {
  const parsed = entidadeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("entidades")
    .update({
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      cor: parsed.data.cor ?? null,
      icone: parsed.data.icone ?? null,
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    return {
      error: error.code === "23505" ? "Já existe uma entidade com esse nome." : "Não foi possível atualizar.",
    };
  }
  revalidar();
  return {};
}

export async function excluirEntidade(id: string): Promise<{ error?: string }> {
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  const { error } = await supabase.from("entidades").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) {
    // 23503 = titular de conta/cartão/investimento (FK RESTRICT).
    return {
      error:
        error.code === "23503"
          ? "Essa pessoa é titular de contas ou cartões. Remova-os antes de excluí-la."
          : "Não foi possível excluir.",
    };
  }
  revalidar();
  return {};
}

export async function atualizarConta(id: string, input: ContaInput): Promise<{ error?: string }> {
  const parsed = contaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("contas_bancarias")
    .update({
      titular_id: parsed.data.titular_id,
      banco: parsed.data.banco,
      apelido: parsed.data.apelido,
      tipo: parsed.data.tipo,
      agencia: parsed.data.agencia ?? null,
      numero: parsed.data.numero ?? null,
      eh_conta_compartilhada: parsed.data.eh_conta_compartilhada,
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível atualizar a conta." };
  revalidar();
  return {};
}

export async function excluirConta(id: string): Promise<{ error?: string }> {
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  const { error } = await supabase.from("contas_bancarias").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível excluir a conta." };
  revalidar();
  return {};
}

export async function atualizarCartao(id: string, input: CartaoInput): Promise<{ error?: string }> {
  const parsed = cartaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("cartoes")
    .update({
      titular_id: parsed.data.titular_id,
      banco: parsed.data.banco,
      apelido: parsed.data.apelido,
      bandeira: parsed.data.bandeira ?? null,
      ultimos_digitos: parsed.data.ultimos_digitos ?? null,
      dia_fechamento: parsed.data.dia_fechamento ?? null,
      dia_vencimento: parsed.data.dia_vencimento ?? null,
      limite: parsed.data.limite ?? null,
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível atualizar o cartão." };
  revalidar();
  return {};
}

export async function excluirCartao(id: string): Promise<{ error?: string }> {
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  const { error } = await supabase.from("cartoes").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível excluir o cartão." };
  revalidar();
  return {};
}

/* ------------------------------------------------------------------ */
/* Contas fixas (recorrências)                                         */
/* ------------------------------------------------------------------ */

export async function criarRecorrencia(input: RecorrenciaInput): Promise<{ error?: string }> {
  const parsed = recorrenciaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.from("recorrencias").insert({
    workspace_id: ctx.workspaceId,
    descricao: d.descricao,
    tipo: d.tipo,
    valor_previsto: d.valor_previsto,
    frequencia: d.frequencia,
    data_inicio: d.data_inicio,
    data_fim: d.data_fim ?? null,
    categoria_id: d.categoria_id ?? null,
    meio_pagamento: d.meio_pagamento ?? null,
    cartao_id: d.cartao_id ?? null,
    conta_id: d.conta_id ?? null,
    dia_vencimento: diaDe(d.data_inicio),
    // Por padrão não recria o passado: 1ª geração na próxima data >= hoje (mantém o
    // dia do vencimento). Só desce até a data de início quando o usuário pede retroativo.
    proxima_geracao: primeiraGeracao(
      d.frequencia,
      d.data_inicio,
      new Date().toISOString().slice(0, 10),
      d.retroativo ?? false,
    ),
    ativa: true,
  });
  if (error) return { error: "Não foi possível salvar a conta fixa." };
  revalidar();
  return {};
}

export async function atualizarRecorrencia(
  id: string,
  input: RecorrenciaInput,
): Promise<{ error?: string }> {
  const parsed = recorrenciaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase
    .from("recorrencias")
    .update({
      descricao: d.descricao,
      tipo: d.tipo,
      valor_previsto: d.valor_previsto,
      frequencia: d.frequencia,
      data_inicio: d.data_inicio,
      data_fim: d.data_fim ?? null,
      categoria_id: d.categoria_id ?? null,
      meio_pagamento: d.meio_pagamento ?? null,
      cartao_id: d.cartao_id ?? null,
      conta_id: d.conta_id ?? null,
      dia_vencimento: diaDe(d.data_inicio),
      // NÃO mexer em proxima_geracao aqui: reeditar não pode ressuscitar o backfill
      // nem recriar ocorrências já apagadas. Editar valor/categoria vale só pras próximas.
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível atualizar a conta fixa." };
  revalidar();
  return {};
}

/** Liga/desliga a geração automática (sem apagar a recorrência). */
export async function alternarRecorrencia(id: string, ativa: boolean): Promise<{ error?: string }> {
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  const { error } = await supabase
    .from("recorrencias")
    .update({ ativa })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível atualizar a conta fixa." };
  revalidar();
  return {};
}

export async function excluirRecorrencia(id: string): Promise<{ error?: string }> {
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  // Lançamentos já gerados ficam (recorrencia_id vira NULL por FK SET NULL).
  const { error } = await supabase.from("recorrencias").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível excluir a conta fixa." };
  revalidar();
  return {};
}
