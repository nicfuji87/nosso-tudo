import type { Metadata } from "next";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import { isPlatformAdmin } from "@/lib/auth";
import {
  listAlertas,
  listDestinatariosVerificados,
  listEnviosRecentes,
} from "@/lib/admin/alertas";
import { getWhatsappDispatch } from "@/lib/admin/settings";
import { AlertasManager } from "@/components/admin/alertas-manager";

export const metadata: Metadata = { title: "Alertas · Admin" };

export default async function AdminAlertasPage() {
  const admin = await isPlatformAdmin();
  if (!admin) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-4 text-body-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        Os alertas proativos da Nia (push por WhatsApp) são restritos a admins de plataforma.
      </div>
    );
  }

  const [alertas, destinatarios, envios, dispatch] = await Promise.all([
    listAlertas(),
    listDestinatariosVerificados(),
    listEnviosRecentes(20),
    getWhatsappDispatch(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-h4 font-semibold">Alertas proativos (WhatsApp)</h2>
        <p className="text-body-sm text-muted-foreground">
          A Nia avalia as finanças de hora em hora e envia avisos pelo WhatsApp da aplicação
          (uazapi). Tudo roda no Supabase — o n8n cuida só do agente conversacional.
        </p>
      </div>

      {!dispatch.uazapiPronto && (
        <div className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-4 text-body-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            A credencial uazapi (URL + token) ainda não está completa. Configure em{" "}
            <span className="font-medium">Integrações → WhatsApp</span> para os envios funcionarem.
          </span>
        </div>
      )}

      <AlertasManager
        alertas={alertas}
        destinatarios={destinatarios}
        envios={envios}
        uazapiPronto={dispatch.uazapiPronto}
      />
    </div>
  );
}
