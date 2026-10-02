/** Rótulos amigáveis dos parâmetros (`config`) e das políticas das automações. */

export const CONFIG_LABEL: Record<string, { label: string; dica?: string }> = {
  limit_per_category: { label: "Limite por categoria", dica: "Máximo de produtos coletados por categoria em cada execução." },
  batch: { label: "Tamanho do lote", dica: "Quantos itens são processados por execução." },
  per_run: { label: "Por execução", dica: "Quantos produtos recebem criativos a cada execução." },
  lead_minutes: { label: "Antecedência (min)", dica: "Revalida o produto este tanto antes do horário do Pin." },
  lookback_days: { label: "Janela retroativa (dias)", dica: "Quantos dias para trás as métricas são recoletadas." },
  retention_days: { label: "Retenção (dias)", dica: "Dados temporários mais antigos que isso são removidos." },
};

/**
 * Rótulos específicos por tipo de job — o mesmo `batch` significa coisas diferentes
 * em cada automação (V2 §11.10: imagens, links e pacotes).
 */
export const CONFIG_LABEL_POR_JOB: Record<string, Record<string, { label: string; dica?: string }>> = {
  REFRESH_PRODUCT_MEDIA: {
    batch: { label: "Produtos por execução", dica: "Quantos produtos aprovados têm as imagens do anúncio reimportadas a cada execução." },
  },
  VALIDATE_AFFILIATE_REDIRECT: {
    batch: { label: "Links por execução", dica: "Quantos links de afiliado (de produtos com publicação próxima) têm o redirecionamento conferido a cada execução." },
  },
  GENERATE_PINTEREST_PACKAGE: {
    batch: { label: "Criativos por execução", dica: "Quantos criativos aprovados sem pacote pronto recebem o pacote Pinterest a cada execução." },
  },
};

function definicaoConfig(chave: string, jobType?: string | null): { label: string; dica?: string } | undefined {
  return (jobType ? CONFIG_LABEL_POR_JOB[jobType]?.[chave] : undefined) ?? CONFIG_LABEL[chave];
}

export function rotuloConfig(chave: string, jobType?: string | null): string {
  return definicaoConfig(chave, jobType)?.label ?? chave.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function dicaConfig(chave: string, jobType?: string | null): string | undefined {
  return definicaoConfig(chave, jobType)?.dica;
}

export const OVERLAP_LABEL: Record<string, string> = {
  skip: "Pular nova execução",
  queue: "Enfileirar e aguardar a anterior",
  cancel_previous: "Cancelar a anterior",
};

export const OVERLAP_DICA: Record<string, string> = {
  skip: "Se a execução anterior ainda estiver ativa, a nova é ignorada.",
  queue: "A nova entra na fila e só começa quando a anterior terminar.",
  cancel_previous: "A execução ativa é cancelada e a nova começa em seguida.",
};

export function formatarValorConfig(v: unknown): string {
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
