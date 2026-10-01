"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOME_PROVEDOR } from "./tipos";

/** Feedback da volta do OAuth (`?ok=conectado&provider=…` / `?erro=…&provider=…`). */
export function BannerRetorno({ ok, erro, provider }: { ok?: string; erro?: string; provider?: string }) {
  const router = useRouter();
  if (!ok && !erro) return null;
  const nome = provider ? NOME_PROVEDOR[provider] ?? provider : null;
  const sucesso = !erro;
  const titulo = sucesso
    ? `${nome ?? "Integração"} conectado com sucesso.`
    : `Não foi possível conectar${nome ? ` o ${nome}` : ""}.`;
  const detalhe = sucesso
    ? provider === "pinterest"
      ? "Os seus boards já estão sendo sincronizados. Em seguida, escolha qual board recebe cada categoria."
      : "Tudo pronto. Se quiser, rode o Teste completo no fim da página."
    : `${erro} — confira se o Redirect URI cadastrado no app é exatamente o mostrado abaixo e tente de novo.`;

  return (
    <div
      role={sucesso ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        sucesso ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/5",
      )}
    >
      {sucesso ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold">{titulo}</p>
        <p className="break-words text-body-sm text-muted-foreground">{detalhe}</p>
      </div>
      <button
        type="button"
        onClick={() => router.replace(provider ? `/ml/integracoes#${provider}` : "/ml/integracoes", { scroll: false })}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        aria-label="Fechar aviso"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
