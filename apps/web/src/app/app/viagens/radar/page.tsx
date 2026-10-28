import type { Metadata } from "next";
import { getWorkspaceContext, isPlatformAdmin } from "@/lib/auth";
import { lerUso, listarRotas, listarSnapshots, milheiroDoWorkspace } from "@/lib/viagens/radar-dados";
import { chaveSerpApi } from "@/lib/viagens/serpapi";
import { RadarPainel } from "@/components/viagens/radar-painel";

export const metadata: Metadata = { title: "Radar de rotas · Viagens · Nosso Tudo" };
// O botão "Atualizar agora" roda a busca dentro da server action desta página.
export const maxDuration = 60;

export default async function RadarPage() {
  if (!(await isPlatformAdmin())) {
    return (
      <p className="max-w-2xl text-body-sm text-muted-foreground">
        O radar de rotas usa uma conta pessoal do seats.aero e ainda está disponível só para o
        administrador.
      </p>
    );
  }
  const { workspace } = await getWorkspaceContext();
  const [rotas, snapshots, milheiro, uso, chave] = await Promise.all([
    listarRotas(workspace.id),
    listarSnapshots(workspace.id, 60),
    milheiroDoWorkspace(workspace.id),
    lerUso(),
    chaveSerpApi(),
  ]);

  return (
    <RadarPainel
      rotas={rotas}
      snapshots={snapshots}
      precos={milheiro.precos}
      programasPadrao={milheiro.programasPadrao}
      uso={uso}
      temChaveSerpApi={!!chave}
    />
  );
}
