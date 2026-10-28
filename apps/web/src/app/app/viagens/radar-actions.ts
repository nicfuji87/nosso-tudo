"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext, isPlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { expandirLocais } from "@/lib/viagens/aeroportos";
import { FONTES_SEATS } from "@/lib/viagens/milheiro";
import { CABINES } from "@/lib/viagens/radar-calc";
import { garantirConfig, rodarBatida, type ResumoBatida } from "@/lib/viagens/rotina";
import { limparCacheChaveSerpApi } from "@/lib/viagens/serpapi";

/**
 * Ações do radar de rotas e das promoções.
 *
 * Gate: platform admin. O token do seats.aero é da conta Pro pessoal (uso
 * não-comercial — ver PLANO-VIAGENS.md §2/§3.1), e cada busca gasta cota.
 * O isolamento entre workspaces é do RLS (policy p_ws).
 */

type Resultado = { error?: string; ok?: boolean };

async function exigirAdmin(): Promise<string | null> {
  return (await isPlatformAdmin()) ? null : "Recurso disponível só para o administrador por enquanto.";
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const intOpcional = z
  .union([z.coerce.number().int().positive(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (typeof v === "number" ? v : null));

const rotaSchema = z
  .object({
    id: z.string().uuid().optional(),
    nome: z.string().trim().min(1, "Dê um nome para a rota.").max(80),
    origens: z.string().trim().min(3, "Informe ao menos uma origem."),
    destinos: z.string().trim().min(3, "Informe ao menos um destino."),
    dataInicio: data,
    dataFim: data,
    duracaoMin: intOpcional,
    duracaoMax: intOpcional,
    pessoas: z.coerce.number().int().min(1).max(9),
    cabine: z.enum(CABINES),
    programas: z.array(z.string()).default([]),
    apenasDireto: z.boolean().default(false),
    incluirDinheiro: z.boolean().default(true),
    alertaMilhasPp: intOpcional,
    alertaReaisPp: intOpcional,
  })
  .refine((v) => v.dataFim >= v.dataInicio, { message: "A data final vem antes da inicial.", path: ["dataFim"] })
  .refine((v) => v.duracaoMin == null || v.duracaoMax == null || v.duracaoMax >= v.duracaoMin, {
    message: "Duração máxima menor que a mínima.",
    path: ["duracaoMax"],
  });

export async function salvarRota(raw: unknown): Promise<Resultado> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };
  const parsed = rotaSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const origens = expandirLocais(d.origens);
  const destinos = expandirLocais(d.destinos);
  const invalidos = [...origens.invalidos, ...destinos.invalidos];
  if (invalidos.length) return { error: `Não reconheci: ${invalidos.join(", ")}. Use código IATA (ex.: GRU) ou um grupo (ex.: Japão).` };
  if (origens.aeroportos.length > 10) return { error: "No máximo 10 aeroportos de origem." };
  if (destinos.aeroportos.length > 40) return { error: "No máximo 40 aeroportos de destino." };

  const duracaoMin = d.duracaoMin ?? d.duracaoMax;
  const duracaoMax = d.duracaoMax ?? d.duracaoMin;
  const { workspace } = await getWorkspaceContext();
  const linha = {
    workspace_id: workspace.id,
    nome: d.nome,
    origens: origens.aeroportos,
    destinos: destinos.aeroportos,
    data_inicio: d.dataInicio,
    data_fim: d.dataFim,
    duracao_min: duracaoMin,
    duracao_max: duracaoMax,
    pessoas: d.pessoas,
    cabine: d.cabine,
    programas: d.programas.filter((p) => p in FONTES_SEATS),
    apenas_direto: d.apenasDireto,
    incluir_dinheiro: d.incluirDinheiro,
    alerta_milhas_pp: d.alertaMilhasPp,
    alerta_reais_pp_cents: d.alertaReaisPp != null ? d.alertaReaisPp * 100 : null,
    // Edição muda o que se busca: força rodar de novo na próxima batida.
    ultima_execucao: null,
    ultimo_erro: null,
  };
  const supabase = createClient();
  const { error } = d.id
    ? await supabase.from("viagem_radar_rotas").update(linha).eq("id", d.id).eq("workspace_id", workspace.id)
    : await supabase.from("viagem_radar_rotas").insert(linha);
  if (error) return { error: "Não consegui salvar a rota." };
  revalidatePath("/app/viagens/radar");
  return { ok: true };
}

export async function alternarRota(id: string, ativo: boolean): Promise<Resultado> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };
  const { workspace } = await getWorkspaceContext();
  const { error } = await createClient()
    .from("viagem_radar_rotas")
    .update({ ativo })
    .eq("id", id)
    .eq("workspace_id", workspace.id);
  if (error) return { error: "Não consegui atualizar a rota." };
  revalidatePath("/app/viagens/radar");
  return { ok: true };
}

export async function excluirRota(id: string): Promise<Resultado> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };
  const { workspace } = await getWorkspaceContext();
  const { error } = await createClient().from("viagem_radar_rotas").delete().eq("id", id).eq("workspace_id", workspace.id);
  if (error) return { error: "Não consegui excluir a rota." };
  revalidatePath("/app/viagens/radar");
  return { ok: true };
}

const configSchema = z.object({
  origens: z.string().trim(),
  cabines: z.array(z.enum(CABINES)).min(1, "Escolha ao menos uma cabine."),
  programas: z.array(z.string()).default([]),
  pessoas: z.coerce.number().int().min(1).max(9),
  descontoMinimoPct: z.coerce.number().int().min(0).max(90),
  avisoWhatsapp: z.boolean(),
  dinheiroPromo: z.boolean(),
  serpapiMensalMax: z.coerce.number().int().min(0).max(100_000),
});

export async function salvarConfigPromo(raw: unknown): Promise<Resultado> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  const origens = expandirLocais(d.origens);
  if (origens.invalidos.length) return { error: `Não reconheci: ${origens.invalidos.join(", ")}.` };
  if (origens.aeroportos.length > 8) return { error: "No máximo 8 origens fixas (cada uma gasta cota todo dia)." };

  const { workspace } = await getWorkspaceContext();
  await garantirConfig(workspace.id);
  const { error } = await createClient()
    .from("viagem_radar_config")
    .update({
      origens_promo: origens.aeroportos,
      cabines_promo: d.cabines,
      programas: d.programas.filter((p) => p in FONTES_SEATS),
      pessoas_promo: d.pessoas,
      desconto_minimo_pct: d.descontoMinimoPct,
      aviso_whatsapp: d.avisoWhatsapp,
      dinheiro_promo: d.dinheiroPromo,
      serpapi_mensal_max: d.serpapiMensalMax,
      // Mudou o que se varre: a próxima batida refaz as promoções de hoje.
      ultima_promo_em: null,
    })
    .eq("workspace_id", workspace.id);
  if (error) return { error: "Não consegui salvar a configuração." };
  revalidatePath("/app/viagens/promocoes");
  return { ok: true };
}

export async function salvarChaveSerpApi(chave: string): Promise<Resultado> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };
  const valor = chave.trim();
  if (valor && !/^[A-Za-z0-9]{20,100}$/.test(valor)) return { error: "Essa não parece uma chave do SerpApi." };
  const { error } = await createAdminClient().rpc("viagem_secret_set", { p_name: "viagens/serpapi/api_key", p_value: valor });
  if (error) return { error: "Não consegui guardar a chave." };
  limparCacheChaveSerpApi();
  revalidatePath("/app/viagens/promocoes");
  revalidatePath("/app/viagens/radar");
  return { ok: true };
}

/** "Atualizar agora": roda radar + promoções deste workspace já, sem esperar a madrugada. */
export async function atualizarAgora(): Promise<Resultado & { resumo?: ResumoBatida }> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };
  const { workspace } = await getWorkspaceContext();
  await garantirConfig(workspace.id);
  const resumo = await rodarBatida({ orcamentoMs: 50_000, origem: "manual", workspaceId: workspace.id, forcar: true });
  revalidatePath("/app/viagens/radar");
  revalidatePath("/app/viagens/promocoes");
  return { ok: true, resumo };
}
