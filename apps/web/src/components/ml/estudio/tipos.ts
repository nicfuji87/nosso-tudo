import type { ResultadoBusca } from "@/lib/ml/estudio/busca";

export type { ResultadoBusca };

export interface PromptSalvo {
  id: string;
  nome: string;
  texto: string;
  usos: number;
}

export interface BoardEstudio {
  id: string;
  nome: string;
  padrao: boolean;
}

export interface ProdutoEscolhido {
  productId: string;
  titulo: string;
  fotos: string[];
  linkProduto: string | null;
  linkAfiliado: string | null;
}

export interface Integracoes {
  openai: boolean;
  apify: boolean;
  pinterest: boolean;
  mercadolivre: boolean;
}

/** Produto do link colado: título/foto (do link ou do catálogo) e, se achado na busca, o resultado completo. */
export interface ProdutoRef {
  titulo: string;
  imagem: string | null;
  preco: number | null;
  resultado: ResultadoBusca | null;
}

export const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
