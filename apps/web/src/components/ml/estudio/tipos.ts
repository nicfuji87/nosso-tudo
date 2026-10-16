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

export interface ProdutoRef {
  id: string;
  tipo?: "PRODUCT" | "USER_PRODUCT" | "ITEM";
  titulo: string;
  imagem: string | null;
  preco: number | null;
}

export const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
