import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Plan, Profile, Workspace, WorkspaceRole } from "@/lib/types/db";

/** Há credenciais Supabase configuradas? */
function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Usuário autenticado (revalidado no servidor). Null se env ausente. */
export const getUser = cache(async () => {
  if (!hasSupabaseEnv()) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Profile do usuário logado, ou null. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/entrar");
  return profile;
}

export interface WorkspaceContext {
  profile: Profile;
  workspace: Workspace;
  role: WorkspaceRole;
  plan: Plan;
}

/**
 * Contexto completo do workspace ativo. Resolve onboarding:
 * - sem profile → /entrar
 * - onboarding não concluído ou sem workspace → /onboarding
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const profile = await getProfile();
  if (!profile) redirect("/entrar");

  if (!profile.onboarding_concluido || !profile.default_workspace_id) {
    redirect("/onboarding");
  }

  // Só cria o client após os guards — evita throw quando env ausente.
  const supabase = createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", profile.default_workspace_id)
    .maybeSingle();

  if (!workspace) redirect("/onboarding");

  const [{ data: member }, { data: plan }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace.id)
      .eq("profile_id", profile.id)
      .maybeSingle(),
    supabase.from("plans").select("*").eq("id", (workspace as Workspace).plan_id).maybeSingle(),
  ]);

  return {
    profile,
    workspace: workspace as Workspace,
    role: ((member as { role: WorkspaceRole } | null)?.role ?? "member") as WorkspaceRole,
    plan: plan as Plan,
  };
});

/** Helper de gating de plano (PRD §2.1, hook usePlan/useCanUseFeature). */
export function canUseFeature(plan: Plan, feature: string): boolean {
  return Boolean(plan.features?.[feature]);
}

export interface AdminContext extends WorkspaceContext {
  /** É owner do workspace ativo? */
  isOwner: boolean;
  /** É admin de plataforma? (edita segredos globais: Asaas, uazapi, n8n) */
  isPlatformAdmin: boolean;
}

/** É admin de plataforma? Lê o próprio registro em platform_admins (policy p_pa_self). */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  const supabase = createClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  return Boolean(data);
});

/** Contexto do workspace + flags de admin (owner / platform admin). */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const [ctx, platformAdmin] = await Promise.all([getWorkspaceContext(), isPlatformAdmin()]);
  return { ...ctx, isOwner: ctx.role === "owner", isPlatformAdmin: platformAdmin };
});

/**
 * Guard da área admin. Owners de workspace e platform admins entram; demais
 * são redirecionados. Segredos globais ficam gated a `isPlatformAdmin` nas actions.
 */
export async function requireAdminAccess(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx.isOwner && !ctx.isPlatformAdmin) redirect("/app");
  return ctx;
}

/**
 * Resolve o workspace ativo para Server Actions, sem redirecionar
 * (retorna erro tratável). Usar em mutações.
 */
export async function resolveWorkspaceId(): Promise<
  { workspaceId: string; userId: string } | { error: string }
> {
  const user = await getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (data as { default_workspace_id: string | null } | null)?.default_workspace_id;
  if (!workspaceId) return { error: "Workspace não encontrado." };
  return { workspaceId, userId: user.id };
}
