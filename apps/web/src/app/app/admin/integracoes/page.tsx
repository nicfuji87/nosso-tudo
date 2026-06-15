import type { Metadata } from "next";
import { getAdminContext } from "@/lib/auth";
import { getAsaasPublic, getNiaPublic, getWhatsappPublic } from "@/lib/admin/settings";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AsaasForm } from "@/components/admin/asaas-form";
import { WhatsappForm } from "@/components/admin/whatsapp-form";
import { NiaForm } from "@/components/admin/nia-form";

export const metadata: Metadata = { title: "Integrações · Admin" };

export default async function IntegracoesPage() {
  const { isPlatformAdmin } = await getAdminContext();
  const [asaas, whatsapp, nia] = await Promise.all([
    getAsaasPublic(),
    getWhatsappPublic(),
    getNiaPublic(),
  ]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ingestEndpoint = `${supabaseUrl}/functions/v1/ingest-whatsapp`;

  return (
    <Tabs defaultValue="asaas" className="w-full">
      <TabsList>
        <TabsTrigger value="asaas">Asaas (cobrança)</TabsTrigger>
        <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        <TabsTrigger value="nia">Nia (IA)</TabsTrigger>
      </TabsList>

      <TabsContent value="asaas">
        <AsaasForm initial={asaas} canEditSecrets={isPlatformAdmin} />
      </TabsContent>

      <TabsContent value="whatsapp">
        <WhatsappForm
          initial={whatsapp}
          canEditSecrets={isPlatformAdmin}
          ingestEndpoint={ingestEndpoint}
        />
      </TabsContent>

      <TabsContent value="nia">
        <NiaForm initial={nia} canEditSecrets={isPlatformAdmin} />
      </TabsContent>
    </Tabs>
  );
}
