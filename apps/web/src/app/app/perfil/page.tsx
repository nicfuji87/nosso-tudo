import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PerfilForm } from "@/components/perfil/perfil-form";
import { MemoriaNiaCard } from "@/components/perfil/memoria-nia-card";
import { PerfilFamiliaCard } from "@/components/perfil/perfil-familia-card";
import { getMemoriaNia, getPerfilFamilia } from "./actions";
import { formatBRL } from "@/lib/format";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const { profile, workspace, plan, role } = await getWorkspaceContext();
  const isPro = plan.slug === "pro";
  const [perfilFamilia, memoria] = await Promise.all([getPerfilFamilia(), getMemoriaNia()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Perfil e conta" description="Seus dados, plano e preferências." />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
            <CardDescription>Mantenha suas informações atualizadas.</CardDescription>
          </CardHeader>
          <CardContent>
            <PerfilForm profile={profile} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Plano */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Plano {plan.nome}
                {isPro && <Badge variant="accent" size="sm">Pro</Badge>}
              </CardTitle>
              <CardDescription>
                {isPro
                  ? "Você tem acesso a tudo: WhatsApp, IA e conciliação."
                  : "Faça upgrade para WhatsApp, IA e conciliação de faturas."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isPro && (
                <>
                  <p className="tabular text-h3 font-semibold">
                    {formatBRL(plan.preco_mensal_brl ?? 19.9)}
                    <span className="text-body-sm font-normal text-muted-foreground"> /mês</span>
                  </p>
                  <Button className="w-full">
                    <Sparkles className="size-4" /> Assinar o Pro
                  </Button>
                  <p className="text-caption text-muted-foreground">
                    Cobrança via Asaas (Pix, Boleto ou Cartão). Em breve.
                  </p>
                </>
              )}
              <div className="rounded-lg bg-secondary/60 p-3 text-caption text-muted-foreground">
                Espaço: <span className="font-medium text-foreground">{workspace.nome}</span> ·
                Seu papel: <span className="font-medium text-foreground">{role === "owner" ? "Dono" : "Membro"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Zona de dados (LGPD) */}
          <Card>
            <CardHeader>
              <CardTitle>Seus dados (LGPD)</CardTitle>
              <CardDescription>Você tem controle total sobre seus dados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="secondary" className="w-full" disabled>
                Exportar meus dados (em breve)
              </Button>
              <Button variant="ghost" className="w-full text-destructive" disabled>
                Excluir conta (em breve)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Perfil da família — a identidade estável que a Nia sempre recebe */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" /> Perfil da família
          </CardTitle>
          <CardDescription>
            O básico de quem é a família — a Nia sempre tem isto em mente pra entender com quem está falando. Estável:
            só muda quando você atualizar aqui (ou confirmar uma sugestão forte da Nia).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PerfilFamiliaCard perfilInicial={perfilFamilia} />
        </CardContent>
      </Card>

      {/* Memória da Nia — o que a assistente lembra da família (editável) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" /> Memória da Nia
          </CardTitle>
          <CardDescription>
            O que a Nia lembra sobre a rotina e as preferências da família — usado como contexto nas conversas. Revise,
            corrija ou apague o que quiser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemoriaNiaCard fatosIniciais={memoria} />
        </CardContent>
      </Card>
    </div>
  );
}
