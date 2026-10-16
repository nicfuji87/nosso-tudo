import {
  Activity,
  BarChart3,
  CalendarClock,
  FileText,
  ClipboardList,
  Compass,
  LayoutDashboard,
  Package,
  Palette,
  PlugZap,
  ScrollText,
  Sparkles,
  TrendingUp,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export interface MlNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: "pendencias";
  /** "principal" = fluxo simples (sempre visível); "avancado" = recolhido. */
  grupo: "principal" | "avancado";
}

/** Navegação da área ML: o fluxo simples em cima, o resto em "Avançado". */
export const ML_NAV: MlNavItem[] = [
  { href: "/ml/estudio", label: "Criar Pin", icon: Sparkles, grupo: "principal" },
  { href: "/ml/publicacoes", label: "Pins publicados", icon: CalendarClock, grupo: "principal" },
  { href: "/ml/desempenho", label: "Desempenho", icon: TrendingUp, grupo: "principal" },
  { href: "/ml", label: "Dashboard", icon: LayoutDashboard, exact: true, grupo: "avancado" },
  { href: "/ml/pendencias", label: "Pendências", icon: ClipboardList, badge: "pendencias", grupo: "avancado" },
  { href: "/ml/descobertas", label: "Descobertas", icon: Compass, grupo: "avancado" },
  { href: "/ml/produtos", label: "Produtos", icon: Package, grupo: "avancado" },
  { href: "/ml/criativos", label: "Criativos", icon: Palette, grupo: "avancado" },
  { href: "/ml/paginas", label: "Páginas", icon: FileText, grupo: "avancado" },
  { href: "/ml/analytics", label: "Analytics", icon: BarChart3, grupo: "avancado" },
  { href: "/ml/automacoes", label: "Automações", icon: Activity, grupo: "avancado" },
  { href: "/ml/integracoes", label: "Integrações", icon: PlugZap, grupo: "avancado" },
  { href: "/ml/configuracoes", label: "Configurações", icon: Settings2, grupo: "avancado" },
  { href: "/ml/logs", label: "Logs & Erros", icon: ScrollText, grupo: "avancado" },
];
