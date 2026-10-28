import type { Metadata } from "next";
import { getWorkspaceContext, isPlatformAdmin } from "@/lib/auth";
import { configPadrao, lerConfig, lerUso, listarPromocoes, milheiroDoWorkspace } from "@/lib/viagens/radar-dados";
import { chaveSerpApi } from "@/lib/viagens/serpapi";
import { PromocoesPainel } from "@/components/viagens/promocoes-painel";

export const metadata: Metadata = { title: "Promoções · Viagens · Nosso Tudo" };
// O botão "Atualizar agora" roda a varredura dentro da server action desta página.
export const maxDuration = 60;

export default async function PromocoesPage() {
  if (!(await isPlatformAdmin())) {
    return (
      <p className="max-w-2xl text-body-sm text-muted-foreground">
        As promoções usam uma conta pessoal do seats.aero e ainda estão disponíveis só para o
        administrador.
      </p>
    );
  }
  const { workspace } = await getWorkspaceContext();
  const [config, promos, uso, chave, milheiro] = await Promise.all([
    lerConfig(workspace.id),
    listarPromocoes(workspace.id),
    lerUso(),
    chaveSerpApi(),
    milheiroDoWorkspace(workspace.id),
  ]);

  return (
    <PromocoesPainel
      config={config ?? configPadrao(workspace.id, milheiro.programasPadrao)}
      programasPadrao={milheiro.programasPadrao}
      dataRef={promos.dataRef}
      promocoes={promos.itens}
      uso={uso}
      chaveSerpApiFinal={chave ? `••••${chave.slice(-4)}` : null}
    />
  );
}
