import {
  Home,
  ArrowLeftRight,
  BarChart3,
  Layers,
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
  { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/app/colecoes", label: "Coleções", icon: Layers },
  { href: "/app/cadastros", label: "Cadastros", icon: SlidersHorizontal },
];
