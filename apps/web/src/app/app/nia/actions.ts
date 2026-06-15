"use server";

import { createClient } from "@/lib/supabase/server";
import { criarTransacao } from "@/app/app/transacoes/actions";
import { listCategorias } from "@/lib/db/queries";
import { lancarTransacaoArgs } from "@/lib/nia/schemas";
import { atualizarAcao } from "@/lib/nia/store";
import { normalizarTexto } from "@/lib/normalize";

interface AcaoRow {
  id: string;
  workspace_id: string;
  ferramenta: string;
  status: string;
  payload_proposto: unknown;
}

/** Executa o lançamento proposto pela Nia, após confirmação do usuário. */
export async function confirmarTransacao(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("nia_acoes")
    .select("id, workspace_id, ferramenta, status, payload_proposto")
    .eq("id", acaoId)
    .maybeSingle();
  const acao = data as AcaoRow | null;
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "lancar_transacao") return { error: "Ação não suportada." };

  const parsed = lancarTransacaoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  // Resolve categoria por nome (match exato normalizado), se informada.
  let categoriaId: string | undefined;
  if (d.categoria) {
    const alvo = normalizarTexto(d.categoria);
    const cats = await listCategorias(acao.workspace_id);
    categoriaId = cats.find((c) => normalizarTexto(c.nome) === alvo)?.id;
  }

  const res = await criarTransacao({
    tipo: d.tipo,
    descricao: d.descricao,
    valor: d.valor,
    data_transacao: d.data_transacao ?? new Date().toISOString().slice(0, 10),
    categoria_id: categoriaId,
    meio_pagamento: d.meio_pagamento,
    estabelecimento: d.estabelecimento,
    tags: [],
  });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
  return { ok: true };
}

/** Descarta uma proposta da Nia. */
export async function rejeitarAcao(acaoId: string): Promise<{ ok: boolean }> {
  await atualizarAcao(acaoId, { status: "rejeitada" });
  return { ok: true };
}
