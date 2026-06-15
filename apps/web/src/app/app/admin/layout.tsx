import { requireAdminAccess } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Guard: owners e platform admins entram; demais → /app. Segredos globais
  // ficam gated a isPlatformAdmin dentro das server actions.
  const { isPlatformAdmin } = await requireAdminAccess();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h2 font-semibold tracking-tight">Administração</h1>
        <p className="text-body-sm text-muted-foreground">
          Configurações da plataforma, integrações, planos e anúncios.
        </p>
      </div>
      <AdminNav />
      {children}
      {!isPlatformAdmin && (
        <p className="text-caption text-muted-foreground">
          Você está como <span className="font-medium text-foreground">owner</span>. Segredos de
          plataforma (chaves Asaas, token uazapi, secret do n8n) são editáveis apenas por um admin
          de plataforma.
        </p>
      )}
    </div>
  );
}
