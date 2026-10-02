import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Hourglass,
  Loader2,
  Package,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FAMILIA_STATUS_LABEL, FIDELIDADE_STATUS_LABEL, PACOTE_STATUS_LABEL } from "./rotulos";

type Tom = "default" | "tech" | "success" | "warning" | "destructive" | "accent" | "outline";
type Def = { tom: Tom; icon: LucideIcon; spin?: boolean };

const FAMILIA: Record<string, Def> = {
  planning: { tom: "default", icon: Hourglass },
  generating: { tom: "tech", icon: Loader2, spin: true },
  active: { tom: "success", icon: CheckCircle2 },
  archived: { tom: "outline", icon: Ban },
};

const FIDELIDADE: Record<string, Def> = {
  not_required: { tom: "outline", icon: ShieldCheck },
  pending: { tom: "default", icon: Hourglass },
  ok: { tom: "success", icon: ShieldCheck },
  warning: { tom: "warning", icon: AlertTriangle },
  failed: { tom: "destructive", icon: XCircle },
  human_ok: { tom: "success", icon: UserCheck },
};

const PACOTE: Record<string, Def> = {
  missing: { tom: "default", icon: CircleDashed },
  incomplete: { tom: "warning", icon: Package },
  ready: { tom: "success", icon: Package },
  invalid: { tom: "destructive", icon: AlertTriangle },
};

function Selo({ def, label, className }: { def: Def | undefined; label: string; className?: string }) {
  const d = def ?? { tom: "default" as Tom, icon: CircleDashed };
  const Icon = d.icon;
  return (
    <Badge variant={d.tom} className={cn("whitespace-nowrap", className)}>
      <Icon className={cn("size-3.5", d.spin && "animate-spin")} aria-hidden />
      {label}
    </Badge>
  );
}

export function FamiliaStatusBadge({ status, className }: { status: string; className?: string }) {
  return <Selo def={FAMILIA[status]} label={FAMILIA_STATUS_LABEL[status] ?? status} className={className} />;
}

export function FidelidadeBadge({ status, className }: { status: string; className?: string }) {
  return <Selo def={FIDELIDADE[status]} label={FIDELIDADE_STATUS_LABEL[status] ?? `Fidelidade: ${status}`} className={className} />;
}

export function PacoteBadge({ status, className }: { status: string; className?: string }) {
  return <Selo def={PACOTE[status]} label={PACOTE_STATUS_LABEL[status] ?? `Pacote: ${status}`} className={className} />;
}

export function IaBadge({ className }: { className?: string }) {
  return (
    <Badge variant="accent" className={cn("whitespace-nowrap", className)} title="Imagem gerada ou modificada por IA (AI disclosure)">
      <Sparkles className="size-3.5" aria-hidden />
      IA
    </Badge>
  );
}
