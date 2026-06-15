import type { AsaasEnvironment } from "@/lib/admin/settings";

/** Base URLs da API Asaas (v3) por ambiente. Header de auth: `access_token`. */
export const ASAAS_BASE_URL: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};
