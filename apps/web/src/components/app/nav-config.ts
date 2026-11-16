import {
  Home,
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  HeartPulse,
  Layers,
  Plane,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Início", icon: Home, exact: true },
  { href: "/app/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/app/faturas", label: "Faturas", icon: CreditCard },
  { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/app/viagens", label: "Viagens", icon: Plane },
  { href: "/app/saude", label: "Saúde", icon: HeartPulse },
  { href: "/app/colecoes", label: "Coleções", icon: Layers },
  { href: "/app/cadastros", label: "Cadastros", icon: SlidersHorizontal },
];
