/** Item de Descobertas já preparado no servidor (serializável para o cliente). */
export interface ItemDescoberta {
  id: string;
  titulo: string;
  thumb: string | null;
  categoria: string | null;
  status: string;
  preco: number | null;
  precoOriginal: number | null;
  desconto: number | null;
  rank: number | null;
  rankDelta: number | null;
  tendencias: string[];
  rating: number | null;
  reviews: number | null;
  origens: string[];
  score: number | null;
  confianca: number | null;
  elegivel: boolean | null;
  disponivel: boolean | null;
  descobertoEm: string;
  repeticao: string;
  vezesVisto: number;
  porque: string[];
  alertas: string[];
  regrasDuras: string[];
  permalink: string | null;
  /** V2 §11.2 — imagens disponíveis do anúncio (galeria importada ou `pictures`). */
  imagens: number;
  /** Qualidade visual da imagem principal: pela análise de IA ou, na falta, pela resolução. */
  qualidadeImagem: QualidadeImagem | null;
  /** Potencial de uso lifestyle (0–100): Pinterest fit da IA ou fator do score. */
  potencialLifestyle: number | null;
  /** Já existe família de criativos em planejamento, geração ou ativa. */
  familiaAtiva: boolean;
}

export interface QualidadeImagem {
  nivel: "alta" | "media" | "baixa";
  fonte: "ia" | "resolucao";
  detalhe: string;
}
