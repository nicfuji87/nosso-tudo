import { z } from "zod";

/**
 * Saídas estruturadas da IA na V2 (JSON Schema strict + Zod). O texto dos
 * prompts vem dos templates versionados no banco (ml_prompt_templates).
 */
const textos = { type: "array", items: { type: "string" } } as const;

// ---------------------------------------------------------------------------
// Plano da família (hipótese, benefício, headlines, editorial)
// ---------------------------------------------------------------------------
export const planoFamiliaZod = z.object({
  nome: z.string().min(3).max(80),
  hipotese: z.string().min(5).max(300),
  objetivo: z.string().min(3).max(160),
  headlines: z.array(z.string().min(3).max(60)).min(1).max(6),
  editorial_titulo: z.string().min(3).max(70),
  editorial_pontos: z.array(z.string().min(3).max(90)).min(2).max(4),
});
export type PlanoFamiliaIA = z.infer<typeof planoFamiliaZod>;

export const planoFamiliaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "hipotese", "objetivo", "headlines", "editorial_titulo", "editorial_pontos"],
  properties: {
    nome: { type: "string", description: "Nome curto da família/hipótese (ex.: Organize o box sem reforma)." },
    hipotese: { type: "string", description: "Hipótese de marketing: quem é o público e qual problema/desejo." },
    objetivo: { type: "string", description: "Benefício principal em poucas palavras (ex.: organização sem furar a parede)." },
    headlines: { ...textos, description: "3 a 4 headlines curtas (até 45 caracteres) para aplicar na arte, diferentes entre si." },
    editorial_titulo: { type: "string", description: "Título de um Pin editorial informativo (ex.: 3 ideias para organizar o box)." },
    editorial_pontos: { ...textos, description: "3 dicas curtas e úteis, sem inventar características do produto." },
  },
} as const;

export const INSTRUCOES_PLANO = [
  "Você planeja conteúdo de afiliados para o Pinterest (pt-BR).",
  "Use APENAS os dados do produto. Não invente características, medidas, garantias ou funções.",
  "Headlines: curtas, concretas, focadas em problema/benefício; sem preço, sem 'melhor do mundo'.",
  "Dicas editoriais: úteis por si só, sem prometer o que o anúncio não sustenta.",
].join("\n");

// ---------------------------------------------------------------------------
// Pacote Pinterest por variante
// ---------------------------------------------------------------------------
export const pacoteZod = z.object({
  titulo: z.string().min(3).max(120),
  descricao: z.string().min(10).max(900),
  alt_text: z.string().min(5).max(500),
  palavras_chave: z.array(z.string().max(60)).max(12),
  interesses: z.array(z.string().max(60)).max(8),
});
export type PacoteIA = z.infer<typeof pacoteZod>;

export const pacoteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "descricao", "alt_text", "palavras_chave", "interesses"],
  properties: {
    titulo: { type: "string" },
    descricao: { type: "string" },
    alt_text: { type: "string", description: "Descrição objetiva da IMAGEM anexada (acessibilidade)." },
    palavras_chave: textos,
    interesses: { ...textos, description: "Interesses/temas do Pinterest relacionados (apenas referência interna)." },
  },
} as const;

// ---------------------------------------------------------------------------
// Checagem de fidelidade (V2 §5.2)
// ---------------------------------------------------------------------------
export const fidelidadeZod = z.object({
  quantidade_ok: z.boolean(),
  cor_acabamento_ok: z.boolean(),
  geometria_ok: z.boolean(),
  instalacao_ok: z.boolean(),
  sem_acessorios_extras: z.boolean(),
  sem_texto_preco_claim: z.boolean(),
  funcoes_ok: z.boolean(),
  escala_ok: z.boolean(),
  score: z.number().min(0).max(100),
  problemas: z.array(z.string().max(200)).max(8),
  resumo: z.string().max(400),
});
export type FidelidadeIA = z.infer<typeof fidelidadeZod>;

export const fidelidadeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "quantidade_ok",
    "cor_acabamento_ok",
    "geometria_ok",
    "instalacao_ok",
    "sem_acessorios_extras",
    "sem_texto_preco_claim",
    "funcoes_ok",
    "escala_ok",
    "score",
    "problemas",
    "resumo",
  ],
  properties: {
    quantidade_ok: { type: "boolean" },
    cor_acabamento_ok: { type: "boolean" },
    geometria_ok: { type: "boolean" },
    instalacao_ok: { type: "boolean" },
    sem_acessorios_extras: { type: "boolean" },
    sem_texto_preco_claim: { type: "boolean" },
    funcoes_ok: { type: "boolean" },
    escala_ok: { type: "boolean" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    problemas: textos,
    resumo: { type: "string" },
  },
} as const;

export const ITENS_FIDELIDADE: { chave: keyof Omit<FidelidadeIA, "score" | "problemas" | "resumo">; label: string }[] = [
  { chave: "quantidade_ok", label: "Quantidade de peças igual ao produto" },
  { chave: "cor_acabamento_ok", label: "Cor e acabamento coerentes" },
  { chave: "geometria_ok", label: "Geometria e estrutura coerentes" },
  { chave: "instalacao_ok", label: "Modo de instalação não inventado" },
  { chave: "sem_acessorios_extras", label: "Sem acessórios não incluídos parecendo parte do produto" },
  { chave: "sem_texto_preco_claim", label: "Sem garantia, preço ou claim inexistente" },
  { chave: "funcoes_ok", label: "Sem funções que o anúncio não sustenta" },
  { chave: "escala_ok", label: "Tamanho não parece maior/menor de forma enganosa" },
];

/** Status a partir da análise: conservador (na dúvida, alerta). */
export function statusFidelidade(f: FidelidadeIA): "ok" | "warning" | "failed" {
  const falhas = ITENS_FIDELIDADE.filter((i) => !f[i.chave]).length;
  if (falhas === 0 && f.score >= 80) return "ok";
  if (falhas <= 1 && f.score >= 60) return "warning";
  return "failed";
}
