import { Home, ArrowLeftRight, Layers, SlidersHorizontal, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Início", icon: Home, exact: true },
  { href: "/app/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/app/colecoes", label: "Coleções", icon: Layers },
  { href: "/app/cadastros", label: "Cadastros", icon: SlidersHorizontal },
];
