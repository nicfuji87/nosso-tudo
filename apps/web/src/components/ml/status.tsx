import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock,
  Hourglass,
  ImagePlus,
  Link2Off,
  Loader2,
  PauseCircle,
  Search,
  Send,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CREATIVE_STATUS_LABEL, PIN_STATUS_LABEL, PRODUCT_STATUS_LABEL } from "@/lib/ml/estados";
import { JOB_STATUS_LABEL } from "@/lib/ml/jobs/tipos";
import { cn } from "@/lib/utils";

type Tom = "default" | "tech" | "success" | "warning" | "destructive" | "accent" | "outline";
type Def = { tom: Tom; icon: LucideIcon; spin?: boolean };

const PRODUTO: Record<string, Def> = {
  discovered: { tom: "default", icon: Search },
  enriching: { tom: "tech", icon: Loader2, spin: true },
  analyzed: { tom: "tech", icon: Sparkles },
  approved: { tom: "success", icon: CheckCircle2 },
  waiting_affiliate_link: { tom: "warning", icon: Link2Off },
  ready_for_creative: { tom: "accent", icon: CircleDashed },
  creative_draft: { tom: "tech", icon: ImagePlus },
  ready_to_schedule: { tom: "accent", icon: CalendarClock },
  scheduled: { tom: "tech", icon: CalendarClock },
  published: { tom: "success", icon: Send },
  paused: { tom: "outline", icon: PauseCircle },
  rejected: { tom: "outline", icon: XCircle },
  error: { tom: "destructive", icon: AlertTriangle },
};

const CRIATIVO: Record<string, Def> = {
  to_generate: { tom: "default", icon: CircleDashed },
  generating: { tom: "tech", icon: Loader2, spin: true },
  waiting_manual_image: { tom: "warning", icon: ImagePlus },
  review: { tom: "accent", icon: Hourglass },
  approved: { tom: "success", icon: CheckCircle2 },
  rejected: { tom: "outline", icon: XCircle },
  published: { tom: "success", icon: Send },
  archived: { tom: "outline", icon: Ban },
};

const PIN: Record<string, Def> = {
  draft: { tom: "default", icon: CircleDashed },
  pending_approval: { tom: "warning", icon: Hourglass },
  scheduled: { tom: "tech", icon: CalendarClock },
  publishing: { tom: "tech", icon: Loader2, spin: true },
  published: { tom: "success", icon: Send },
  failed: { tom: "destructive", icon: XCircle },
  blocked: { tom: "destructive", icon: Ban },
  canceled: { tom: "outline", icon: Ban },
  paused: { tom: "outline", icon: PauseCircle },
};

const JOB: Record<string, Def> = {
  queued: { tom: "default", icon: Clock },
  running: { tom: "tech", icon: Loader2, spin: true },
  succeeded: { tom: "success", icon: CheckCircle2 },
  failed: { tom: "warning", icon: AlertTriangle },
  dead: { tom: "destructive", icon: XCircle },
  canceled: { tom: "outline", icon: Ban },
};

const MAPAS = {
  product: { defs: PRODUTO, labels: PRODUCT_STATUS_LABEL as Record<string, string> },
  creative: { defs: CRIATIVO, labels: CREATIVE_STATUS_LABEL as Record<string, string> },
  pin: { defs: PIN, labels: PIN_STATUS_LABEL as Record<string, string> },
  job: { defs: JOB, labels: JOB_STATUS_LABEL },
};

/** Status com texto + ícone (nunca só cor — spec §25). */
export function StatusBadge({
  tipo,
  status,
  className,
}: {
  tipo: keyof typeof MAPAS;
  status: string;
  className?: string;
}) {
  const m = MAPAS[tipo];
  const d = m.defs[status] ?? { tom: "default" as Tom, icon: CircleDashed };
  const Icon = d.icon;
  return (
    <Badge variant={d.tom} className={cn("whitespace-nowrap", className)}>
      <Icon className={cn("size-3.5", d.spin && "animate-spin")} aria-hidden />
      {m.labels[status] ?? status}
    </Badge>
  );
}

export function ScoreBadge({ score, confianca, className }: { score: number | null; confianca?: number | null; className?: string }) {
  if (score == null) return <Badge variant="outline" className={className}>sem score</Badge>;
  const tom: Tom = score >= 75 ? "success" : score >= 55 ? "tech" : score >= 40 ? "warning" : "destructive";
  return (
    <Badge variant={tom} className={cn("tabular", className)} title={confianca != null ? `Confiança ${Math.round(confianca * 100)}%` : undefined}>
      {Math.round(score)}
      {confianca != null && confianca < 0.6 && <span className="opacity-70">·?</span>}
    </Badge>
  );
}
