import type { Database } from "./database.types";

/** Linhas das tabelas ml_* derivadas do schema gerado (`pnpm ml:types`). */
type Tabelas = Database["public"]["Tables"];

export type ProdutoRow = Tabelas["ml_products"]["Row"];
export type SnapshotRow = Tabelas["ml_product_snapshots"]["Row"];
export type RankingRow = Tabelas["ml_product_rankings"]["Row"];
export type TendenciaRow = Tabelas["ml_trends"]["Row"];
export type CategoriaRow = Tabelas["ml_categories"]["Row"];
export type ScoreRow = Tabelas["ml_product_scores"]["Row"];
export type LinkAfiliadoRow = Tabelas["ml_affiliate_links"]["Row"];
export type AnguloRow = Tabelas["ml_creative_angles"]["Row"];
export type CriativoRow = Tabelas["ml_creatives"]["Row"];
export type AssetRow = Tabelas["ml_creative_assets"]["Row"];
export type BoardRow = Tabelas["ml_pinterest_boards"]["Row"];
export type PinRow = Tabelas["ml_pins"]["Row"];
export type MetricaPinRow = Tabelas["ml_pin_metrics"]["Row"];
export type ComissaoRow = Tabelas["ml_commissions"]["Row"];
export type PendenciaRow = Tabelas["ml_tasks"]["Row"];
export type AuditoriaRow = Tabelas["ml_audit_log"]["Row"];
export type HistoricoStatusRow = Tabelas["ml_status_history"]["Row"];
export type ScheduleRunRow = Tabelas["ml_schedule_runs"]["Row"];
export type JobLogRow = Tabelas["ml_job_logs"]["Row"];
export type ApiCallRow = Tabelas["ml_api_calls"]["Row"];

export interface AnaliseIA {
  pinterest_fit: number;
  apelo_visual: number;
  qualidade_imagem: number;
  intencao_compra: "alta" | "media" | "baixa";
  publico: string;
  resumo: string;
  pontos_fortes: string[];
  riscos: string[];
  modelo?: string;
  analisado_em?: string;
}

export interface ComponenteScore {
  key: string;
  label: string;
  weight: number;
  value: number;
  points: number;
  detail: string;
  missing: boolean;
  estimated?: boolean;
}
