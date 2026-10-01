import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Autorização da área ML. Papel efetivo vem do banco (`ml_role()`):
 * platform admin = owner; demais conforme ml_members. Sem papel = sem acesso.
 *
 * viewer   → só leitura
 * operator → opera o dia a dia (aprovar, links, criativos, publicar)
 * admin    → integrações, automações, configurações
 * owner    → tudo + gestão de membros
 */
export const ML_ROLES = ["viewer", "operator", "admin", "owner"] as const;
export type MlRole = (typeof ML_ROLES)[number];

export function temPapel(atual: MlRole | null, minimo: MlRole): boolean {
  if (!atual) return false;
  return ML_ROLES.indexOf(atual) >= ML_ROLES.indexOf(minimo);
}

export const getMlRole = cache(async (): Promise<MlRole | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ml_role");
  if (error) return null;
  return (ML_ROLES as readonly string[]).includes(data as string) ? (data as MlRole) : null;
});

export interface MlSessao {
  userId: string;
  email: string | null;
  role: MlRole;
}

/** Guard de página: sem login → /entrar; sem papel → /ml/sem-acesso. */
export async function requireMlPage(minimo: MlRole = "viewer"): Promise<MlSessao> {
  const user = await getUser();
  if (!user) redirect("/entrar?redirect=/ml");
  const role = await getMlRole();
  if (!temPapel(role, minimo)) redirect("/ml/sem-acesso");
  return { userId: user.id, email: user.email ?? null, role: role! };
}

/** Guard de Server Action/Route: devolve erro tratável em vez de redirecionar. */
export async function requireMlAction(minimo: MlRole = "operator"): Promise<MlSessao | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  const role = await getMlRole();
  if (!role) return { error: "Você não tem acesso à área ML." };
  if (!temPapel(role, minimo)) return { error: "Seu papel não permite esta ação." };
  return { userId: user.id, email: user.email ?? null, role };
}
