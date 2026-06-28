import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PerfilForm } from "@/components/perfil/perfil-form";
import { ListaCuradaCard } from "@/components/perfil/memoria-nia-card";
import { PerfilFamiliaCard } from "@/components/perfil/perfil-familia-card";
import {
  getMemoriaNia,
  getPerfilFamilia,
  getPreferenciasNia,
  salvarMemoriaNia,
  salvarPreferenciasNia,
} from "./actions";
import { formatBRL } from "@/lib/format";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const { profile, workspace, plan, role } = await getWorkspaceContext();
  const isPro = plan.slug === "pro";
  const [perfilFamilia, memoria, preferencias] = await Promise.all([
    getPerfilFamilia(),
    getMemoriaNia(),
    getPreferenciasNia(),
  ]);

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
          <ListaCuradaCard
            itensIniciais={memoria}
            salvar={salvarMemoriaNia}
            addPlaceholder="Adicionar algo que a Nia deve lembrar…"
            emptyText="A Nia ainda não guardou nada. Conforme você conversa, ela aprende a rotina e as preferências da família — e tudo o que ela lembrar aparece aqui."
            saveLabel="Salvar memória"
            toastOk="Memória atualizada"
          />
        </CardContent>
      </Card>

      {/* Preferências — como a família gosta que as coisas sejam feitas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" /> Preferências
          </CardTitle>
          <CardDescription>
            Como vocês gostam que as coisas sejam feitas — regras duráveis que deixam a Nia consistente (ex.:
            &lsquo;cartão padrão é o Latam&rsquo;, &lsquo;não separar gorjeta&rsquo;, chamar alguém por um apelido).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListaCuradaCard
            itensIniciais={preferencias}
            salvar={salvarPreferenciasNia}
            addPlaceholder="Adicionar uma preferência…"
            emptyText="Sem preferências ainda. Quando você disser como prefere (cartão padrão, apelidos, o que ignorar…), a Nia guarda aqui."
            saveLabel="Salvar preferências"
            toastOk="Preferências atualizadas"
            maxLen={200}
          />
        </CardContent>
      </Card>
    </div>
  );
}
