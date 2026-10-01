/** Formas de dados que o Dashboard lê (subconjuntos das tabelas ml_*). */

export interface ContadoresDashboard {
  descobertos_24h: number;
  descobertos_7d: number;
  aguardando_analise: number;
  aguardando_aprovacao: number;
  aguardando_link: number;
  criativos_revisao: number;
  imagens_manuais: number;
  criativos_em_geracao: number;
  pins_aprovacao: number;
  pins_agendados: number;
  pins_publicados_7d: number;
  pins_publicados_total: number;
  pins_hoje: number;
  aprovados_hoje: number;
  pins_falha: number;
  jobs_falha_7d: number;
  jobs_ativos: number;
  pendencias_abertas: number;
  metricas_7d: { impressions: number; saves: number; pin_clicks: number; outbound_clicks: number };
}

export const CONTADORES_VAZIOS: ContadoresDashboard = {
  descobertos_24h: 0,
  descobertos_7d: 0,
  aguardando_analise: 0,
  aguardando_aprovacao: 0,
  aguardando_link: 0,
  criativos_revisao: 0,
  imagens_manuais: 0,
  criativos_em_geracao: 0,
  pins_aprovacao: 0,
  pins_agendados: 0,
  pins_publicados_7d: 0,
  pins_publicados_total: 0,
  pins_hoje: 0,
  aprovados_hoje: 0,
  pins_falha: 0,
  jobs_falha_7d: 0,
  jobs_ativos: 0,
  pendencias_abertas: 0,
  metricas_7d: { impressions: 0, saves: 0, pin_clicks: 0, outbound_clicks: 0 },
};

export interface AgendamentoResumo {
  id: string;
  name: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
}

export interface IntegracaoResumo {
  provider: string;
  status: string;
  account_name: string | null;
  last_error: string | null;
  access_expires_at: string | null;
}

export interface PendenciaResumo {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  priority: number;
  created_at: string;
}

export interface ProdutoRecente {
  id: string;
  title: string;
  thumbnail: string | null;
  score: number | null;
  score_confidence: number | null;
  status: string;
  first_seen_at: string;
  current_price: number | null;
}

export interface PinTop {
  chave: string;
  titulo: string;
  thumbnail: string | null;
  href: string;
  externo: string | null;
  impressions: number;
  outbound_clicks: number;
  saves: number;
  ctr: number | null;
}

export interface Atividade {
  id: string;
  quando: string;
  tipo: "auditoria" | "transicao";
  titulo: string;
  detalhe: string | null;
  ator: string;
  href: string | null;
}
