import { CREATIVE_STATUS_LABEL, PIN_STATUS_LABEL, PRODUCT_STATUS_LABEL } from "@/lib/ml/estados";

/**
 * Formatação e rótulos compartilhados pelas telas de Logs, Automações e Dashboard.
 * Puro (sem server-only) — funciona em Server e Client Components.
 */

export const PAGINA_TAMANHO = 50;

export function idCurto(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function formatarDuracao(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0).replace(".", ",")} s`;
  const m = Math.floor(s / 60);
  const resto = Math.round(s % 60);
  if (m < 60) return resto ? `${m} min ${resto} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

const NUM = new Intl.NumberFormat("pt-BR");
const NUM_COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function formatarNumero(n: number | null | undefined, compacto = false): string {
  if (n == null || Number.isNaN(n)) return "—";
  return compacto && Math.abs(n) >= 10000 ? NUM_COMPACTO.format(n) : NUM.format(n);
}

export function formatarPercentual(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(casas).replace(".", ",")}%`;
}

/** "em 12 min", "há 3 h", "agora". */
export function tempoRelativo(data: string | Date | null | undefined, agora: number = Date.now()): string {
  if (!data) return "—";
  const t = typeof data === "string" ? new Date(data).getTime() : data.getTime();
  if (Number.isNaN(t)) return "—";
  const diff = t - agora;
  const abs = Math.abs(diff);
  const futuro = diff > 0;
  const min = Math.round(abs / 60000);
  let txt: string;
  if (min < 1) return "agora";
  if (min < 60) txt = `${min} min`;
  else if (min < 60 * 24) txt = `${Math.round(min / 60)} h`;
  else txt = `${Math.round(min / 1440)} d`;
  return futuro ? `em ${txt}` : `há ${txt}`;
}

export function truncarTexto(t: string | null | undefined, max = 120): string {
  if (!t) return "";
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

export const ATOR_LABEL: Record<string, string> = {
  user: "Usuário",
  system: "Sistema",
  automation: "Automação",
};

export const ENTIDADE_LABEL: Record<string, string> = {
  product: "Produto",
  creative: "Criativo",
  pin: "Pin",
  job: "Job",
  schedule: "Automação",
  settings: "Configuração",
  integration: "Integração",
  category: "Categoria",
  board: "Board",
  task: "Pendência",
  commission: "Comissão",
  member: "Membro",
};

export function rotuloEntidade(tipo: string | null | undefined): string {
  if (!tipo) return "—";
  return ENTIDADE_LABEL[tipo] ?? tipo;
}

/** Destino na UI para uma entidade referenciada em logs/pendências. */
export function linkEntidade(tipo: string | null | undefined, id: string | null | undefined): string | null {
  if (!tipo || !id) return null;
  switch (tipo) {
    case "product":
      return `/ml/produtos/${id}`;
    case "creative":
      return `/ml/criativos?criativo=${encodeURIComponent(id)}`;
    case "pin":
      return `/ml/publicacoes?pin=${encodeURIComponent(id)}`;
    case "job":
      return `/ml/logs?job=${encodeURIComponent(id)}`;
    case "schedule":
      return "/ml/automacoes";
    case "integration":
      return "/ml/integracoes";
    case "settings":
      return "/ml/configuracoes";
    case "category":
      return "/ml/configuracoes";
    default:
      return null;
  }
}

/** Rótulo do status de produto/criativo/Pin para a tela de transições. */
export function rotuloStatusEntidade(tipo: string, status: string | null | undefined): string {
  if (!status) return "—";
  const mapa: Record<string, Record<string, string>> = {
    product: PRODUCT_STATUS_LABEL,
    creative: CREATIVE_STATUS_LABEL,
    pin: PIN_STATUS_LABEL,
  };
  return mapa[tipo]?.[status] ?? status;
}

export const ACAO_AUDITORIA_LABEL: Record<string, string> = {
  "afiliado.adicionar": "Link de afiliado adicionado",
  "afiliado.atualizar": "Link de afiliado atualizado",
  "afiliado.remover": "Link de afiliado removido",
  "automacao.agendar": "Pin agendado automaticamente",
  "automacao.auto_aprovar": "Produto aprovado automaticamente",
  "automacao.gerar_criativos": "Criativos gerados automaticamente",
  "automacao.nivel": "Nível de automação alterado",
  "automacao.editar": "Automação editada",
  "automacao.ativar": "Automação ativada",
  "automacao.desativar": "Automação desativada",
  "automacao.duplicar": "Automação duplicada",
  "automacao.excluir": "Automação excluída",
  "automacao.pausar_tudo": "Automações pausadas",
  "automacao.retomar_tudo": "Automações retomadas",
  "board.atualizar": "Board atualizado",
  "categoria.atualizar": "Categoria atualizada",
  "comissao.adicionar": "Comissão lançada",
  "comissao.importar_csv": "Comissões importadas (CSV)",
  "comissao.remover": "Comissão removida",
  "criativo.aprovar": "Criativo aprovado",
  "criativo.duplicar": "Criativo duplicado",
  "criativo.editar": "Criativo editado",
  "criativo.imagem_manual": "Imagem manual enviada",
  "criativo.rejeitar": "Criativo rejeitado",
  "criativos.gerar_lote": "Criativos gerados em lote",
  "descoberta.executar_agora": "Descoberta disparada manualmente",
  "integracao.apify": "Apify configurado",
  "integracao.credenciais": "Credenciais de integração salvas",
  "integracao.desconectar": "Integração desconectada",
  "integracao.openai": "OpenAI configurada",
  "integracao.testar": "Integração testada",
  "integracao.token_manual": "Token informado manualmente",
  "job.cancelar": "Job cancelado",
  "job.reprocessar": "Job reprocessado",
  "membro.adicionar": "Membro adicionado",
  "membro.remover": "Membro removido",
  "pin.criar": "Pin criado",
  "pin.editar": "Pin editado",
  "pin.publicar": "Pin publicado",
  "pinterest.criar_board": "Board criado no Pinterest",
  "produto.adicionar_manual": "Produto adicionado manualmente",
  "produto.aprovar": "Produto aprovado",
  "produto.descartar": "Produto descartado",
  "produto.pausar": "Produto pausado",
  "produto.reanalisar": "Produto reanalisado",
  "produto.restaurar": "Produto restaurado",
  "produto.retomar": "Produto retomado",
  "runtime.registrar_url": "URL do app registrada",
  "scoring.ativar_versao": "Versão de score ativada",
  "scoring.nova_versao": "Nova versão de score",
};

export function rotuloAcao(acao: string): string {
  const conhecido = ACAO_AUDITORIA_LABEL[acao];
  if (conhecido) return conhecido;
  if (acao.startsWith("config.")) return `Configuração alterada (${acao.slice(7)})`;
  if (acao.startsWith("pendencia.")) return `Pendência: ${acao.slice(10)}`;
  return acao;
}

/** Resultado de um disparo de agendamento (ml_schedule_runs.outcome). */
export const OUTCOME_LABEL: Record<string, string> = {
  enqueued: "Enfileirado",
  skipped_overlap: "Pulado (execução anterior ativa)",
  queued_behind: "Aguardando a anterior",
  canceled_previous: "Anterior cancelada",
  skipped_paused: "Pulado (automações pausadas)",
  error: "Erro ao disparar",
};

export const TRIGGER_LABEL: Record<string, string> = {
  cron: "Agendado",
  manual: "Manual",
};

export const PROVIDER_LABEL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  pinterest: "Pinterest",
  openai: "OpenAI",
  apify: "Apify",
};

export function rotuloProvider(p: string | null | undefined): string {
  if (!p) return "—";
  return PROVIDER_LABEL[p] ?? p;
}

export function jsonBonito(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function jsonVazio(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}
