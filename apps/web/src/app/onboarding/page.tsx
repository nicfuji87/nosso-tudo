import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = { title: "Bem-vindo" };

export default async function OnboardingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/entrar");
  if (profile.onboarding_concluido && profile.default_workspace_id) redirect("/app");

  return <OnboardingFlow nomeUsuario={profile.nome} />;
}
