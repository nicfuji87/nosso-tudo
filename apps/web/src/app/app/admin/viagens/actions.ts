"use server";

import { revalidatePath } from "next/cache";
import { getUser, isPlatformAdmin } from "@/lib/auth";
import {
  marcarVerificada,
  removerTransferencia,
  upsertPrograma,
  upsertTransferencia,
  getGrafo,
} from "@/lib/viagens/grafo";
import { calcularCaminhos, type ResultadoCaminhos } from "@/lib/viagens/caminho";
import { programaSchema, simulacaoSchema, transferenciaSchema } from "@/lib/schemas/viagens";
import { hojeISO } from "@/lib/format";

/**
 * Curadoria do grafo de milhas. TODA ação aqui é restrita a platform admin:
 * este é o dado que decide movimentação irreversível de pontos do usuário.
 */

type Resultado = { error?: string; ok?: boolean };

async function gate(): Promise<{ ok: true } | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  if (!(await isPlatformAdmin())) {
    return { error: "Apenas um admin de plataforma pode editar o grafo de milhas." };
  }
  return { ok: true };
}

function revalidar() {
  revalidatePath("/app/admin/viagens");
}

export async function salvarPrograma(raw: unknown): Promise<Resultado> {
  const g = await gate();
  if ("error" in g) return { error: g.error };

  const parsed = programaSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { id, ...dados } = parsed.data;
  try {
    await upsertPrograma(dados, id);
  } catch (e) {
    const msg = (e as Error).message;
    // Erro mais comum na prática: dois programas com o mesmo slug.
    if (msg.includes("viagem_programas_slug_key")) {
      return { error: "Já existe um programa com esse slug." };
    }
    return { error: "Não foi possível salvar o programa." };
  }

  revalidar();
  return { ok: true };
}

export async function salvarTransferencia(raw: unknown): Promise<Resultado> {
  const g = await gate();
  if ("error" in g) return { error: g.error };

  const parsed = transferenciaSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { id, ...dados } = parsed.data;
  try {
    await upsertTransferencia(dados, id);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("viagem_transf_par_unico")) {
      return { error: "Já existe uma transferência cadastrada entre esses dois programas." };
    }
    return { error: "Não foi possível salvar a transferência." };
  }

  revalidar();
  return { ok: true };
}

export async function excluirTransferencia(id: string): Promise<Resultado> {
  const g = await gate();
  if ("error" in g) return { error: g.error };
  try {
    await removerTransferencia(id);
  } catch {
    return { error: "Não foi possível excluir a transferência." };
  }
  revalidar();
  return { ok: true };
}

/** Atalho da curadoria: "conferi hoje, está certo". */
export async function confirmarVerificacao(id: string, fonteUrl?: string): Promise<Resultado> {
  const g = await gate();
  if ("error" in g) return { error: g.error };
  try {
    await marcarVerificada(id, fonteUrl?.trim() || undefined);
  } catch {
    return { error: "Não foi possível marcar como verificada." };
  }
  revalidar();
  return { ok: true };
}

/**
 * Simulador: roda o motor com saldos digitados à mão.
 *
 * É o teste de fumaça da Fase 0 — prova que o grafo real (e não só as fixtures
 * do teste unitário) produz caminhos que fazem sentido, antes de existir
 * carteira ou chat.
 */
export async function simularCaminho(
  raw: unknown,
): Promise<{ error?: string; resultado?: ResultadoCaminhos }> {
  const g = await gate();
  if ("error" in g) return { error: g.error };

  const parsed = simulacaoSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { programas, transferencias } = await getGrafo();
  const resultado = calcularCaminhos({
    programas,
    transferencias,
    saldos: parsed.data.saldos.filter((s) => s.saldo > 0),
    alvo: { programaId: parsed.data.alvoProgramaId, milhas: parsed.data.milhas },
    hoje: hojeISO(),
  });

  return { resultado };
}
