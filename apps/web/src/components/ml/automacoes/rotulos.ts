/** Rótulos amigáveis dos parâmetros (`config`) e das políticas das automações. */

export const CONFIG_LABEL: Record<string, { label: string; dica?: string }> = {
  limit_per_category: { label: "Limite por categoria", dica: "Máximo de produtos coletados por categoria em cada execução." },
  batch: { label: "Tamanho do lote", dica: "Quantos itens são processados por execução." },
  per_run: { label: "Por execução", dica: "Quantos produtos recebem criativos a cada execução." },
  lead_minutes: { label: "Antecedência (min)", dica: "Revalida o produto este tanto antes do horário do Pin." },
  lookback_days: { label: "Janela retroativa (dias)", dica: "Quantos dias para trás as métricas são recoletadas." },
  retention_days: { label: "Retenção (dias)", dica: "Dados temporários mais antigos que isso são removidos." },
};

export function rotuloConfig(chave: string): string {
  return CONFIG_LABEL[chave]?.label ?? chave.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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
