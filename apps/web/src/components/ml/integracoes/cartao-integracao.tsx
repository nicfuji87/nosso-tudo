import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, ShieldAlert, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import type { IntegracaoView, StatusIntegracao } from "./tipos";

type Tom = "default" | "success" | "warning" | "destructive";

const STATUS: Record<StatusIntegracao, { label: string; icon: LucideIcon; tom: Tom }> = {
  disconnected: { label: "Não conectado", icon: CircleDashed, tom: "default" },
  connected: { label: "Conectado", icon: CheckCircle2, tom: "success" },
  expiring: { label: "Token expirando", icon: Clock, tom: "warning" },
  error: { label: "Erro", icon: AlertTriangle, tom: "destructive" },
  invalid: { label: "Chave inválida", icon: XCircle, tom: "destructive" },
  insufficient_scope: { label: "Escopo insuficiente", icon: ShieldAlert, tom: "warning" },
};

/** Status com texto + ícone (nunca só cor). `rotulos` troca o texto por provedor (ex.: "Sem chave"). */
export function StatusIntegracaoBadge({
  status,
  rotulos,
  className,
}: {
  status: StatusIntegracao;
  rotulos?: Partial<Record<StatusIntegracao, string>>;
  className?: string;
}) {
  const d = STATUS[status] ?? { label: status, icon: Ban, tom: "default" as Tom };
  const Icon = d.icon;
  return (
    <Badge variant={d.tom} className={cn("whitespace-nowrap", className)}>
      <Icon className="size-3.5" aria-hidden />
      {rotulos?.[status] ?? d.label}
    </Badge>
  );
}

function Meta({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{rotulo}</dt>
      <dd className={cn("tabular truncate text-body-sm", destaque && "font-medium text-warning")}>{valor}</dd>
    </div>
  );
}

/**
 * Moldura de um card de integração: título, status (texto+ícone), conta,
 * metadados de verificação/expiração no fuso configurado e o último erro.
 */
export function CartaoIntegracao({
  integ,
  tz,
  titulo,
  descricao,
  icone,
  opcional,
  rotulos,
  mostrarTokens,
  children,
  className,
}: {
  integ: IntegracaoView;
  tz: string;
  titulo: string;
  descricao: React.ReactNode;
  icone: React.ReactNode;
  opcional?: boolean;
  rotulos?: Partial<Record<StatusIntegracao, string>>;
  /** Mostra expiração do token de acesso e da autorização (OAuth). */
  mostrarTokens?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const agora = Date.now();
  const expira = integ.access_expires_at ? new Date(integ.access_expires_at).getTime() : null;
  const expiraLogo = expira != null && expira - agora < 60 * 60 * 1000;
  const fmt = (d: string | null) => formatarNoFuso(d, tz);
  const mostrarErro =
    Boolean(integ.last_error) && (integ.status === "error" || integ.status === "invalid" || integ.status === "insufficient_scope" || integ.status === "expiring");

  return (
    <section
      id={integ.provider}
      className={cn("scroll-mt-20 rounded-xl border border-border/70 bg-card p-5 shadow-card", className)}
      aria-labelledby={`titulo-${integ.provider}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tech/10 text-tech" aria-hidden>
            {icone}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`titulo-${integ.provider}`} className="text-h4 font-semibold tracking-tight">
                {titulo}
              </h2>
              {opcional && (
                <Badge variant="outline" size="sm">
                  Opcional
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-body-sm text-muted-foreground">{descricao}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusIntegracaoBadge status={integ.status} rotulos={rotulos} />
          {integ.account_name && integ.status !== "disconnected" && (
            <span className="max-w-[16rem] truncate text-caption text-muted-foreground" title={integ.account_name}>
              conta {integ.account_name}
            </span>
          )}
        </div>
      </header>

      {mostrarErro && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-body-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 break-words">
            <span className="font-medium">Último erro: </span>
            {integ.last_error}
          </p>
        </div>
      )}

      {integ.status !== "disconnected" && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-secondary/50 px-3 py-2.5 sm:grid-cols-4">
          <Meta rotulo="Conectado em" valor={fmt(integ.connected_at)} />
          <Meta rotulo="Última verificação" valor={fmt(integ.last_checked_at)} />
          {mostrarTokens && (
            <>
              <Meta rotulo="Token de acesso vence" valor={fmt(integ.access_expires_at)} destaque={expiraLogo} />
              <Meta rotulo="Autorização válida até" valor={integ.refresh_expires_at ? fmt(integ.refresh_expires_at) : "sem prazo informado"} />
            </>
          )}
        </dl>
      )}
      {mostrarTokens && integ.status !== "disconnected" && (
        <p className="mt-1.5 text-caption text-muted-foreground">O token de acesso é renovado sozinho; você só reconecta se a autorização vencer ou for revogada.</p>
      )}

      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

/** Passo numerado do guia de configuração. */
export function Passo({ numero, titulo, feito, children }: { numero: number; titulo: string; feito?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
          feito ? "bg-success/15 text-success" : "bg-tech/15 text-tech",
        )}
        aria-hidden
      >
        {feito ? <CheckCircle2 className="size-4" /> : numero}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pb-1">
        <p className="text-body-sm font-semibold">
          <span className="sr-only">Passo {numero}{feito ? " (concluído)" : ""}: </span>
          {titulo}
        </p>
        {children}
      </div>
    </li>
  );
}

/** Caixa de explicação em linguagem simples. */
export function Nota({ icone, children, tom = "info" }: { icone?: React.ReactNode; children: React.ReactNode; tom?: "info" | "aviso" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-body-sm",
        tom === "aviso" ? "border-warning/30 bg-warning/5" : "border-tech/20 bg-tech/5",
      )}
    >
      {icone && <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", tom === "aviso" ? "text-warning" : "text-tech")}>{icone}</span>}
      <div className="min-w-0 space-y-1 text-foreground/90">{children}</div>
    </div>
  );
}
