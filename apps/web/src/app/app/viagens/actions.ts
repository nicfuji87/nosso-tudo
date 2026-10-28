"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth";
import { criarLote, removerLote } from "@/lib/viagens/carteira";
import { ORIGENS_LOTE } from "@/lib/viagens/custo";

/**
 * Ações da carteira de milhas. Escopo de workspace vem de getWorkspaceContext;
 * o isolamento real é do RLS (policy p_ws em viagem_lotes).
 */

type Resultado = { error?: string; ok?: boolean };

const loteSchema = z.object({
  programaId: z.string().uuid("Escolha o programa."),
  quantidade: z.coerce.number().int().min(1, "Informe quantas milhas entraram."),
  // Chega em reais do formulário; guardamos centavos.
  custoReais: z.coerce.number().min(0).default(0),
  origem: z.enum(ORIGENS_LOTE),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  expiraEm: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  descricao: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function adicionarLote(raw: unknown): Promise<Resultado> {
  const parsed = loteSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { workspace } = await getWorkspaceContext();
  const d = parsed.data;

  try {
    await criarLote(workspace.id, {
      programaId: d.programaId,
      quantidade: d.quantidade,
      custoCents: Math.round(d.custoReais * 100),
      origem: d.origem,
      data: d.data,
      expiraEm: d.expiraEm,
      descricao: d.descricao,
    });
  } catch {
    return { error: "Não foi possível salvar o lote." };
  }

  revalidatePath("/app/viagens");
  return { ok: true };
}

export async function excluirLote(loteId: string): Promise<Resultado> {
  const { workspace } = await getWorkspaceContext();
  try {
    await removerLote(workspace.id, loteId);
  } catch {
    return { error: "Não foi possível excluir o lote." };
  }
  revalidatePath("/app/viagens");
  return { ok: true };
}
