/**
 * Ângulos de conteúdo (spec §22) e geração determinística (fallback sem IA).
 * Usa SÓ dados reais do produto — nada é inventado.
 */

export const TIPOS_ANGULO = [
  { tipo: "problema_solucao", label: "Problema → solução" },
  { tipo: "lista_curadoria", label: "Lista / curadoria" },
  { tipo: "inspiracao", label: "Inspiração" },
  { tipo: "antes_depois", label: "Antes/depois conceitual" },
  { tipo: "espaco_pequeno", label: "Espaço pequeno" },
  { tipo: "sem_reforma", label: "Sem reforma / sem furar" },
  { tipo: "organizacao", label: "Organização" },
  { tipo: "comparativo", label: "Comparativo leve" },
  { tipo: "dica_pratica", label: "Dica prática" },
  { tipo: "conveniencia", label: "Conveniência" },
  { tipo: "descoberta", label: "Descoberta / achadinho" },
] as const;
export type TipoAngulo = (typeof TIPOS_ANGULO)[number]["tipo"];

export function labelAngulo(tipo: string): string {
  return TIPOS_ANGULO.find((a) => a.tipo === tipo)?.label ?? tipo;
}

export interface DadosProdutoConteudo {
  titulo: string;
  categoria: string[]; // caminho
  atributos: { name: string; value: string }[];
  marca: string | null;
  preco: number | null;
  rating: number | null;
  avaliacoes: number | null;
  descricao: string | null;
}

/** Nome curto e legível: primeiras palavras significativas, sem códigos/medidas soltas. */
export function nomeCurto(titulo: string, maxPalavras = 5): string {
  const palavras = titulo
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b[A-Z0-9]{2,}-?\d+[A-Z0-9-]*\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return palavras.slice(0, maxPalavras).join(" ").replace(/[,;:-]+$/, "");
}

const VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "para", "com", "em", "a", "o"]);

/** Nome para ganchos: sem "kit N"/quantidades, até 3 palavras de conteúdo, minúsculo. */
export function nomeGancho(titulo: string): string {
  const limpo = nomeCurto(titulo, 12)
    .replace(/^(kit|conjunto|combo|jogo)\s+(c\/\s*)?\d+\s*/i, "")
    .replace(/\d+\s*(p[eç]as|pcs|un|unidades)/gi, "")
    .trim();
  const out: string[] = [];
  let conteudo = 0;
  for (const p of limpo.split(/\s+/)) {
    if (conteudo >= 3) break;
    out.push(p);
    if (!VAZIAS.has(p.toLowerCase())) conteudo++;
  }
  while (out.length && VAZIAS.has(out[out.length - 1]!.toLowerCase())) out.pop();
  return out.join(" ").toLowerCase() || nomeCurto(titulo, 3).toLowerCase();
}

export interface AnguloSugerido {
  type: TipoAngulo;
  hook: string;
  audience: string;
  keyword: string;
  rationale: string;
  score: number;
}

const REGRAS: [RegExp, TipoAngulo[]][] = [
  [/organiz|porta[- ]|caixa|cesto|gaveta|suporte|prateleira|cabide/i, ["organizacao", "espaco_pequeno", "antes_depois"]],
  [/adesiv|sem furo|sem furar|ventosa|autocolante/i, ["sem_reforma", "espaco_pequeno"]],
  [/decora|lumin|lumin[aá]ria|quadro|tapete|cortina|vaso|almofada/i, ["inspiracao", "antes_depois"]],
  [/cozinha|panela|airfryer|utens[ií]lio|pote/i, ["dica_pratica", "problema_solucao", "conveniencia"]],
  [/beleza|maquiagem|skin|cabelo|perfume/i, ["descoberta", "lista_curadoria"]],
  [/infantil|beb[eê]|brinquedo/i, ["conveniencia", "lista_curadoria"]],
];

export function angulosPorRegra(p: DadosProdutoConteudo, quantidade = 4): AnguloSugerido[] {
  const texto = `${p.titulo} ${p.categoria.join(" ")}`;
  const escolhidos: TipoAngulo[] = [];
  for (const [re, tipos] of REGRAS) if (re.test(texto)) escolhidos.push(...tipos);
  escolhidos.push("problema_solucao", "dica_pratica", "descoberta", "inspiracao");
  const unicos = Array.from(new Set(escolhidos)).slice(0, quantidade);
  const nomeMin = nomeGancho(p.titulo);
  const nome = nomeMin.charAt(0).toUpperCase() + nomeMin.slice(1);
  const categoria = p.categoria[p.categoria.length - 1] ?? "casa";
  const ganchos: Record<TipoAngulo, string> = {
    problema_solucao: `Cansou da bagunça? ${nome} resolve`,
    lista_curadoria: `Achados de ${categoria.toLowerCase()} que valem a pena`,
    inspiracao: `Inspiração: ${nomeMin} no seu dia a dia`,
    antes_depois: `Antes e depois com ${nomeMin}`,
    espaco_pequeno: `Ideia para espaços pequenos: ${nomeMin}`,
    sem_reforma: `Sem reforma e sem furar: ${nomeMin}`,
    organizacao: `Organização fácil com ${nomeMin}`,
    comparativo: `Por que escolher ${nomeMin}`,
    dica_pratica: `Dica prática: ${nomeMin}`,
    conveniencia: `Mais praticidade com ${nomeMin}`,
    descoberta: `Achadinho: ${nomeMin}`,
  };
  return unicos.map((type, i) => ({
    type,
    hook: ganchos[type],
    audience: "Quem busca ideias práticas no Pinterest",
    keyword: nomeMin,
    rationale: "Sugerido por regra (sem IA) a partir do título e da categoria.",
    score: Math.max(40, 70 - i * 5),
  }));
}

export interface CopyTemplate {
  headline: string;
  titulo: string;
  descricao: string;
  alt_text: string;
  palavras_chave: string[];
  cta: string;
}

/** Copy determinística a partir de um ângulo — fatos só do próprio anúncio. */
export function copyPorTemplate(p: DadosProdutoConteudo, angulo: { type: string; hook: string; keyword?: string | null }, cta: string): CopyTemplate {
  const nome = nomeCurto(p.titulo, 6);
  const fatos = p.atributos
    .filter((a) => !/^(GTIN|SKU|MODEL|ITEM_CONDITION|SELLER_SKU)$/i.test(a.name) && a.value.length <= 40)
    .slice(0, 3)
    .map((a) => `${a.name}: ${a.value}`);
  const prova =
    p.rating != null && (p.avaliacoes ?? 0) >= 20
      ? `Nota ${p.rating.toFixed(1).replace(".", ",")} com ${p.avaliacoes!.toLocaleString("pt-BR")} avaliações no Mercado Livre.`
      : null;
  const linhas = [
    `${angulo.hook}.`,
    `${p.titulo}${p.marca ? ` — ${p.marca}` : ""}.`,
    fatos.length ? fatos.join(" · ") : null,
    prova,
    `${cta}.`,
  ].filter(Boolean);
  const palavras = [angulo.keyword ?? "", ...p.categoria.slice(-2), p.marca ?? ""].filter(Boolean) as string[];
  const ganchoTemNome = angulo.hook.toLowerCase().includes(nomeGancho(p.titulo));
  return {
    headline: angulo.hook,
    titulo: (ganchoTemNome ? `${angulo.hook}${p.marca ? ` | ${p.marca}` : ""}` : `${nome}: ${angulo.hook}`).slice(0, 100),
    descricao: linhas.join("\n"),
    alt_text: `Foto do produto ${p.titulo}`,
    palavras_chave: palavras,
    cta,
  };
}
