import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardList,
  Compass,
  LayoutDashboard,
  Package,
  Palette,
  PlugZap,
  ScrollText,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export interface MlNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: "pendencias";
}

/** Navegação da área ML (spec §5). */
export const ML_NAV: MlNavItem[] = [
  { href: "/ml", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/ml/pendencias", label: "Pendências", icon: ClipboardList, badge: "pendencias" },
  { href: "/ml/descobertas", label: "Descobertas", icon: Compass },
  { href: "/ml/produtos", label: "Produtos", icon: Package },
  { href: "/ml/criativos", label: "Criativos", icon: Palette },
  { href: "/ml/publicacoes", label: "Publicações", icon: CalendarClock },
  { href: "/ml/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ml/automacoes", label: "Automações", icon: Activity },
  { href: "/ml/integracoes", label: "Integrações", icon: PlugZap },
  { href: "/ml/configuracoes", label: "Configurações", icon: Settings2 },
  { href: "/ml/logs", label: "Logs & Erros", icon: ScrollText },
];
