import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { isPlatformAdmin } from "@/lib/auth";
import { getGrafo } from "@/lib/viagens/grafo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ViagensGrafo } from "@/components/admin/viagens-grafo";
import { ViagensSimulador } from "@/components/admin/viagens-simulador";

export const metadata: Metadata = { title: "Viagens · Admin" };

export default async function AdminViagensPage() {
  // Gate duro: este grafo decide movimentação irreversível de milhas do usuário.
  // Owner de workspace não basta — só platform admin.
  const admin = await isPlatformAdmin();
  if (!admin) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-4 text-body-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        O grafo de milhas é curado apenas por admins de plataforma.
      </div>
    );
  }

  const { programas, transferencias } = await getGrafo();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-h4 font-semibold">Nossa Viagem — grafo de milhas</h2>
        <p className="max-w-3xl text-body-sm text-muted-foreground">
          Programas e transferências que a Nia usa para calcular o caminho mais barato até uma
          emissão. É dado curado à mão de propósito: transferir milhas é irreversível, então nenhum
          ratio aqui pode vir de palpite da IA.
        </p>
      </div>

      <Tabs defaultValue="simulador">
        <TabsList>
          <TabsTrigger value="simulador">Simulador</TabsTrigger>
          <TabsTrigger value="grafo">Grafo</TabsTrigger>
        </TabsList>

        <TabsContent value="simulador">
          <ViagensSimulador programas={programas} />
        </TabsContent>

        <TabsContent value="grafo">
          <ViagensGrafo programas={programas} transferencias={transferencias} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
