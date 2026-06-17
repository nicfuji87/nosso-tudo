import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Acesso ao job pg_cron 'gerar-recorrencias-diario' via funções SECURITY DEFINER
 * (migration 0018). Usa o cliente service_role — o gate de platform admin fica
 * no server action que chama estas funções.
 */

export interface RecorrenciasCronStatus {
  agendado: boolean;
  ativo: boolean;
  schedule: string | null;
  ultimaExecucao: string | null;
  ultimoStatus: string | null;
  ultimaMensagem: string | null;
  recorrenciasAtivas: number;
  lancamentosGerados: number;
}

export async function getRecorrenciasCronStatus(): Promise<RecorrenciasCronStatus | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_recorrencias_status");
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    agendado: Boolean(d.agendado),
    ativo: Boolean(d.ativo),
    schedule: (d.schedule as string | null) ?? null,
    ultimaExecucao: (d.ultima_execucao as string | null) ?? null,
    ultimoStatus: (d.ultimo_status as string | null) ?? null,
    ultimaMensagem: (d.ultima_mensagem as string | null) ?? null,
    recorrenciasAtivas: Number(d.recorrencias_ativas ?? 0),
    lancamentosGerados: Number(d.lancamentos_gerados ?? 0),
  };
}

export async function setRecorrenciasCronAtivo(ativo: boolean): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_recorrencias_set_active", { p_active: ativo });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function rodarRecorrenciasAgora(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_recorrencias_run_now");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
