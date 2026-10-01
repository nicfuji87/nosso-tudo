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
}
