/**
 * Ambientes do módulo Saúde.
 *
 * - production : Supabase de produção (dados reais do relógio). Só o site publicado escreve aqui.
 * - development: Supabase de desenvolvimento (dados sintéticos). É o que `next dev` deve usar.
 *
 * O ambiente vem de NEXT_PUBLIC_APP_ENV; sem ela, `next dev` = development e build = production.
 * Trava: em development, nenhuma ação de Saúde ESCREVE no projeto de produção. Leitura é permitida
 * (o resto do Nosso Tudo continua funcionando localmente contra produção, como hoje).
 */

export const REF_PRODUCAO = "ecwcqooogsvsrddwjavh";

export type Ambiente = "production" | "development";

export function ambienteAtual(): Ambiente {
  const v = process.env.NEXT_PUBLIC_APP_ENV;
  if (v === "production" || v === "development") return v;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function supabaseEhProducao(): boolean {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(REF_PRODUCAO);
}

/** Retorna uma mensagem de erro se a escrita deve ser bloqueada; `null` se pode escrever. */
export function bloqueioDeEscrita(): string | null {
  if (ambienteAtual() === "development" && supabaseEhProducao()) {
    return "Ambiente de desenvolvimento apontando para a produção: alterações de Saúde estão bloqueadas. Use o Supabase de desenvolvimento.";
  }
  return null;
}

/** Rótulo para o selo da página. */
export function rotuloAmbiente(): { texto: string; alerta: boolean } | null {
  if (ambienteAtual() === "production") return null;
  return supabaseEhProducao()
    ? { texto: "DEV · lendo produção (somente leitura)", alerta: true }
    : { texto: "DEV · Supabase de desenvolvimento", alerta: false };
}
