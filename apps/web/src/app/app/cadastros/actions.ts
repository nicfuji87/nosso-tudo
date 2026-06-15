"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/auth";
import { normalizarTexto } from "@/lib/normalize";
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

function revalidar() {
  revalidatePath("/app/cadastros");
  revalidatePath("/app");
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
  });
  if (error) return { error: "Não foi possível salvar a categoria." };
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
