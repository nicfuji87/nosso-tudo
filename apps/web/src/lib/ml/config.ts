import "server-only";
import { z } from "zod";
import { mlDb } from "./db";
import { PARAMETROS_PADRAO } from "./scoring/engine";

/**
 * Configurações do ML. Defaults moram AQUI (validados por Zod); o banco
 * (`ml_settings`) guarda só o que o usuário alterou. Ler sempre por `lerConfig`
 * — nunca confiar em JSON cru do banco.
 */

const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const NIVEIS_AUTOMACAO = [
  { nivel: 0, nome: "Manual", desc: "Descoberta, aprovação, links, imagem e publicação manuais." },
  { nivel: 1, nome: "Assistido", desc: "Descoberta e scoring automáticos; criativos e publicação aprovados à mão." },
  { nivel: 2, nome: "Semi-automático", desc: "Descoberta, scoring e criativos automáticos; humano adiciona link e aprova em lote." },
  { nivel: 3, nome: "Automático controlado", desc: "Score alto + regras estáveis autopublicam depois que o link existe." },
  { nivel: 4, nome: "Otimização", desc: "Prioriza com métricas históricas, mantendo limites e auditoria." },
] as const;

export const configSchemas = {
  geral: z.object({
    timezone: z.string().default("America/Sao_Paulo"),
    nivel_automacao: z.number().int().min(0).max(4).default(1),
    exigir_link_afiliado: z.boolean().default(true),
    disclosure: z.string().max(120).default("Contém link de afiliado."),
  }),
  descoberta: z.object({
    max_por_categoria: z.number().int().min(1).max(50).default(20),
    score_minimo_recomendar: z.number().min(0).max(100).default(45),
    cooldown_descarte_dias: z.number().int().min(0).max(365).default(60),
    repromover_apos_dias: z.number().int().min(0).max(365).default(45),
    incluir_subcategorias: z.boolean().default(true),
    max_subcategorias: z.number().int().min(0).max(30).default(8),
    usar_tendencias: z.boolean().default(true),
    tendencias_buscar_produtos: z.boolean().default(true),
    tendencias_palavras: z.number().int().min(0).max(20).default(5),
    tendencias_produtos_por_palavra: z.number().int().min(1).max(10).default(3),
    enriquecer_com_apify: z.boolean().default(false),
    excluir_duplicatas: z.boolean().default(true),
  }),
  scoring: z.object({
    versao_ativa: z.number().int().min(1).default(1),
    usar_ia: z.boolean().default(true),
    params: z
      .object({
        precoIdealMin: z.number().min(0).default(PARAMETROS_PADRAO.precoIdealMin),
        precoIdealMax: z.number().min(1).default(PARAMETROS_PADRAO.precoIdealMax),
        comissaoAlvo: z.number().min(0.01).default(PARAMETROS_PADRAO.comissaoAlvo),
        ratingPrior: z.number().min(1).max(5).default(PARAMETROS_PADRAO.ratingPrior),
        ratingPeso: z.number().min(0).default(PARAMETROS_PADRAO.ratingPeso),
        diasNovidade: z.number().int().min(1).default(PARAMETROS_PADRAO.diasNovidade),
        tamanhoRanking: z.number().int().min(2).default(PARAMETROS_PADRAO.tamanhoRanking),
      })
      .default({}),
  }),
  automacao: z.object({
    pausado: z.boolean().default(false),
    auto_aprovar_produtos: z.boolean().default(false),
    auto_aprovar_score_min: z.number().min(0).max(100).default(80),
    auto_aprovar_confianca_min: z.number().min(0).max(1).default(0.6),
    auto_gerar_angulos: z.boolean().default(true),
    auto_selecionar_angulos: z.number().int().min(0).max(5).default(0),
    auto_gerar_criativos: z.boolean().default(false),
    auto_aprovar_criativos: z.boolean().default(false),
    auto_aprovar_criativos_qualidade_min: z.number().min(0).max(100).default(80),
    auto_agendar: z.boolean().default(false),
  }),
  publicacao: z.object({
    limite_diario: z.number().int().min(0).max(100).default(5),
    intervalo_minimo_min: z.number().int().min(0).max(1440).default(90),
    janelas: z
      .array(z.object({ dias: z.array(z.number().int().min(0).max(6)), inicio: hhmm, fim: hhmm }))
      .default([{ dias: [], inicio: "09:00", fim: "22:00" }]),
    exigir_aprovacao: z.boolean().default(true),
    autopublicar_score_min: z.number().min(0).max(100).default(85),
    antecedencia_revalidacao_min: z.number().int().min(5).max(1440).default(60),
    variacao_preco_bloqueio_pct: z.number().min(0).max(100).default(20),
    janela_duplicacao_dias: z.number().int().min(0).max(365).default(30),
    max_pins_produto_semana: z.number().int().min(1).max(50).default(2),
    exigir_disclosure: z.boolean().default(true),
  }),
  ia: z.object({
    modelo_texto: z.string().min(1).default("gpt-6-luna"),
    modelo_imagem: z.string().min(1).default("gpt-image-2.5-flare"),
    modo: z.enum(["economico", "qualidade"]).default("economico"),
    qualidade_imagem: z.enum(["low", "medium", "high"]).default("medium"),
    variacao: z.enum(["conservadora", "equilibrada", "criativa"]).default("equilibrada"),
    instrucoes_extras: z.string().max(2000).default(""),
  }),
  criativos: z.object({
    modo_imagem_padrao: z.enum(["composition", "api", "manual_chatgpt"]).default("api"),
    criativos_por_produto: z.number().int().min(1).max(5).default(1),
    variacoes: z.number().int().min(1).max(5).default(3),
    mostrar_preco_na_arte: z.boolean().default(false),
    cta_padrao: z.string().max(40).default("Veja no Mercado Livre"),
    cor_fundo: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#F7F6F2"),
    cor_destaque: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3D6D84"),
  }),
  runtime: z.object({
    app_url: z.string().url().nullable().default(null),
    tick_enabled: z.boolean().default(true),
    worker_paralelo: z.number().int().min(1).max(5).default(3),
  }),
} as const;

export type SecaoConfig = keyof typeof configSchemas;
export type Config<S extends SecaoConfig> = z.infer<(typeof configSchemas)[S]>;
export type ConfigCompleta = { [S in SecaoConfig]: Config<S> };

export async function lerConfig<S extends SecaoConfig>(secao: S): Promise<Config<S>> {
  const { data } = await mlDb().from("ml_settings").select("value").eq("key", secao).maybeSingle();
  const schema = configSchemas[secao];
  const parsed = schema.safeParse((data as { value: unknown } | null)?.value ?? {});
  // Valor corrompido no banco nunca derruba o app: cai nos defaults.
  return (parsed.success ? parsed.data : schema.parse({})) as Config<S>;
}

export async function lerTodasConfigs(): Promise<ConfigCompleta> {
  const { data } = await mlDb().from("ml_settings").select("key, value");
  const porChave = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  const out = {} as Record<string, unknown>;
  for (const secao of Object.keys(configSchemas) as SecaoConfig[]) {
    const schema = configSchemas[secao];
    const p = schema.safeParse(porChave.get(secao) ?? {});
    out[secao] = p.success ? p.data : schema.parse({});
  }
  return out as ConfigCompleta;
}

/** Valida e grava a seção inteira (merge com o atual). Retorna antes/depois para auditoria. */
export async function salvarConfig<S extends SecaoConfig>(
  secao: S,
  parcial: Partial<Config<S>>,
  userId: string | null,
): Promise<{ antes: Config<S>; depois: Config<S> }> {
  const antes = await lerConfig(secao);
  const depois = configSchemas[secao].parse({ ...antes, ...parcial }) as Config<S>;
  const { data: atual } = await mlDb().from("ml_settings").select("version").eq("key", secao).maybeSingle();
  const versao = ((atual as { version: number } | null)?.version ?? 0) + 1;
  const { error } = await mlDb()
    .from("ml_settings")
    .upsert({ key: secao, value: depois, version: versao, updated_by: userId }, { onConflict: "key" });
  if (error) throw new Error(`Falha ao salvar configuração ${secao}: ${error.message}`);
  return { antes, depois };
}

/** Versão (contador de edições) da seção — usada como "prompt base versionado". */
export async function versaoConfig(secao: SecaoConfig): Promise<number> {
  const { data } = await mlDb().from("ml_settings").select("version").eq("key", secao).maybeSingle();
  return (data as { version: number } | null)?.version ?? 0;
}
