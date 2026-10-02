import { z } from "zod";
import { TIPOS_ANGULO, type DadosProdutoConteudo } from "./angulos";

/**
 * Prompts e schemas da IA. Versão dos prompts é gravada em cada resultado
 * (ml_product_scores.prompt_version, ml_creatives.prompt_version) — mudou o
 * texto aqui, suba a versão. Instruções extras do usuário entram com a versão
 * da configuração (`ia@<n>`).
 */
export const PROMPT_VERSAO = "v1";

const BASE = [
  "Você trabalha para uma operação de afiliados que divulga produtos do Mercado Livre no Pinterest (Brasil, pt-BR).",
  "Use APENAS os dados fornecidos. Nunca invente características, medidas, materiais, garantias, prêmios ou resultados.",
  "Se um dado não foi informado, não o mencione.",
].join("\n");

function blocoProduto(p: DadosProdutoConteudo): string {
  const attrs = p.atributos.slice(0, 15).map((a) => `- ${a.name}: ${a.value}`).join("\n");
  return [
    `Título: ${p.titulo}`,
    p.marca ? `Marca: ${p.marca}` : null,
    p.categoria.length ? `Categoria: ${p.categoria.join(" › ")}` : null,
    p.preco != null ? `Preço atual: R$ ${p.preco.toFixed(2)}` : null,
    p.rating != null ? `Avaliação: ${p.rating} (${p.avaliacoes ?? 0} avaliações)` : null,
    attrs ? `Atributos:\n${attrs}` : null,
    p.descricao ? `Descrição do anúncio (resumo): ${p.descricao.slice(0, 800)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const nota = { type: "integer", minimum: 0, maximum: 100 } as const;
const textos = { type: "array", items: { type: "string" } } as const;

// ---------------------------------------------------------------------------
// Análise do produto (scoring)
// ---------------------------------------------------------------------------
export const analiseZod = z.object({
  pinterest_fit: z.number().min(0).max(100),
  apelo_visual: z.number().min(0).max(100),
  qualidade_imagem: z.number().min(0).max(100),
  intencao_compra: z.enum(["alta", "media", "baixa"]),
  publico: z.string().max(200),
  resumo: z.string().max(600),
  pontos_fortes: z.array(z.string().max(200)).max(6),
  riscos: z.array(z.string().max(200)).max(6),
});
export type AnaliseProduto = z.infer<typeof analiseZod>;

export const analiseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pinterest_fit", "apelo_visual", "qualidade_imagem", "intencao_compra", "publico", "resumo", "pontos_fortes", "riscos"],
  properties: {
    pinterest_fit: { ...nota, description: "Quão bem o produto performa no Pinterest (ideias, casa, estilo, presentes, organização)." },
    apelo_visual: { ...nota, description: "Apelo visual do produto para uma imagem inspiracional." },
    qualidade_imagem: { ...nota, description: "Qualidade da FOTO fornecida (nitidez, fundo, enquadramento) para virar criativo." },
    intencao_compra: { type: "string", enum: ["alta", "media", "baixa"] },
    publico: { type: "string", description: "Público provável, em uma frase." },
    resumo: { type: "string", description: "Por que recomendar ou não, em até 2 frases." },
    pontos_fortes: { ...textos, description: "Até 4 pontos fortes baseados nos dados." },
    riscos: { ...textos, description: "Até 4 riscos (ex.: produto genérico, foto ruim, nicho pouco visual)." },
  },
} as const;

export function promptAnalise(extras: string): string {
  return [
    BASE,
    "Tarefa: avaliar o potencial deste produto para conteúdo no Pinterest. Seja criterioso: notas acima de 80 só para produtos claramente visuais e desejáveis.",
    extras ? `Instruções adicionais do operador:\n${extras}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function entradaAnalise(p: DadosProdutoConteudo): string {
  return `${blocoProduto(p)}\n\nA imagem anexada é a foto principal do anúncio.`;
}

// ---------------------------------------------------------------------------
// Ângulos
// ---------------------------------------------------------------------------
const tiposAngulo = TIPOS_ANGULO.map((a) => a.tipo) as [string, ...string[]];

export const angulosZod = z.object({
  angulos: z
    .array(
      z.object({
        type: z.enum(tiposAngulo),
        hook: z.string().min(3).max(90),
        audience: z.string().max(160),
        keyword: z.string().max(60),
        rationale: z.string().max(300),
        score: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(8),
});

export const angulosSchema = {
  type: "object",
  additionalProperties: false,
  required: ["angulos"],
  properties: {
    angulos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "hook", "audience", "keyword", "rationale", "score"],
        properties: {
          type: { type: "string", enum: tiposAngulo },
          hook: { type: "string", description: "Gancho curto (até ~70 caracteres)." },
          audience: { type: "string" },
          keyword: { type: "string", description: "Palavra-chave que as pessoas buscam no Pinterest." },
          rationale: { type: "string", description: "Por que este ângulo funciona para este produto." },
          score: nota,
        },
      },
    },
  },
} as const;

export function promptAngulos(quantidade: number, evitar: string[], extras: string, variacao: string): string {
  return [
    BASE,
    `Tarefa: propor ${quantidade} ângulos de conteúdo DIFERENTES entre si para Pins deste produto.`,
    `Tipos permitidos: ${TIPOS_ANGULO.map((a) => `${a.tipo} (${a.label})`).join(", ")}.`,
    `Estilo de variação: ${variacao}.`,
    evitar.length ? `Não repita estes ganchos já usados:\n${evitar.map((e) => `- ${e}`).join("\n")}` : null,
    extras ? `Instruções adicionais do operador:\n${extras}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------
export const copyZod = z.object({
  headline: z.string().min(3).max(80),
  titulo: z.string().min(3).max(120),
  descricao: z.string().min(10).max(900),
  alt_text: z.string().min(5).max(500),
  palavras_chave: z.array(z.string().max(60)).max(12),
  cta: z.string().max(60),
});
export type CopyIA = z.infer<typeof copyZod>;

export const copySchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "titulo", "descricao", "alt_text", "palavras_chave", "cta"],
  properties: {
    headline: { type: "string", description: "Texto curto para a ARTE (até 45 caracteres)." },
    titulo: { type: "string", description: "Título do Pin (até 90 caracteres), com a palavra-chave." },
    descricao: { type: "string", description: "Descrição do Pin (até 550 caracteres), natural, com palavras-chave, sem hashtags em excesso." },
    alt_text: { type: "string", description: "Texto alternativo descrevendo a imagem para acessibilidade." },
    palavras_chave: { ...textos, description: "Até 8 palavras-chave de busca." },
    cta: { type: "string", description: "Chamada curta para ação (ex.: Veja no Mercado Livre)." },
  },
} as const;

export function promptCopy(p: { evitarHeadlines: string[]; extras: string; ctaPadrao: string; permitirPreco: boolean }): string {
  return [
    BASE,
    "Tarefa: escrever os textos de UM Pin para o ângulo informado.",
    "Regras: sem promessas que não dá para provar (\"o melhor\", \"100% garantido\", curas, frete grátis);",
    p.permitirPreco ? "pode citar o preço informado." : "NÃO cite preço (ele muda).",
    "Não inclua o aviso de afiliado — o sistema adiciona.",
    `CTA padrão sugerido: "${p.ctaPadrao}".`,
    p.evitarHeadlines.length ? `Não repita estas headlines já usadas:\n${p.evitarHeadlines.map((h) => `- ${h}`).join("\n")}` : null,
    p.extras ? `Instruções adicionais do operador:\n${p.extras}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function entradaCopy(p: DadosProdutoConteudo, angulo: { type: string; hook: string; audience?: string | null; keyword?: string | null }): string {
  return `${blocoProduto(p)}\n\nÂngulo: ${angulo.type}\nGancho: ${angulo.hook}${angulo.audience ? `\nPúblico: ${angulo.audience}` : ""}${angulo.keyword ? `\nPalavra-chave: ${angulo.keyword}` : ""}`;
}

// ---------------------------------------------------------------------------
// Prompt de imagem (usado pela API e copiado no modo manual ChatGPT)
// ---------------------------------------------------------------------------
const CENA: Record<string, string> = {
  problema_solucao: "cena realista do dia a dia mostrando o problema resolvido pelo produto",
  lista_curadoria: "composição editorial limpa, estilo flat lay, com o produto em destaque",
  inspiracao: "ambiente inspiracional e aconchegante, luz natural, estilo revista de decoração",
  antes_depois: "ambiente organizado e harmonioso que sugere a transformação",
  espaco_pequeno: "ambiente pequeno (apartamento compacto) bem aproveitado com o produto",
  sem_reforma: "ambiente de apartamento alugado, sem obra, com o produto instalado de forma simples",
  organizacao: "espaço organizado, itens alinhados, sensação de ordem e leveza",
  comparativo: "produto em destaque sobre fundo neutro, iluminação de estúdio",
  dica_pratica: "mãos usando o produto numa situação prática",
  conveniencia: "uso cotidiano e prático do produto, rotina corrida facilitada",
  descoberta: "produto em destaque com estética de achadinho, fundo clean",
};

export function promptImagem(p: { titulo: string; anguloTipo: string; headline: string; modoManual: boolean }): string {
  return [
    p.modoManual
      ? "Use a imagem anexada como referência EXATA do produto."
      : "A imagem de referência é a foto real do produto.",
    `Crie uma imagem vertical 2:3 (1000x1500) para um Pin do Pinterest do produto "${p.titulo}".`,
    `Cena: ${CENA[p.anguloTipo] ?? CENA.descoberta}.`,
    "O produto deve aparecer IDÊNTICO à referência: mesma forma, cor, quantidade, acabamento e proporção. Não adicione nem remova peças.",
    "Fotografia realista, alta qualidade, luz natural suave, cores harmoniosas.",
    p.modoManual
      ? `Escreva no terço superior, em tipografia elegante e legível, apenas o texto: "${p.headline}". Nenhum outro texto, logo, marca d'água ou preço.`
      : "Deixe o terço superior com área limpa (o texto será aplicado depois). Não escreva textos, logos, marcas d'água ou preços.",
  ].join("\n");
}
