import type { Metadata } from "next";
import Link from "next/link";

/**
 * Páginas públicas de produto da Casa Prática (destino dos Pins). Fora de /ml: não exigem
 * login e não importam nada do painel. Sem rastreadores de terceiros e sem cookies próprios.
 * Ficam fora do índice de buscadores (o tráfego vem do Pinterest).
 */
export const metadata: Metadata = {
  title: { default: "Casa Prática", template: "%s · Casa Prática" },
  robots: { index: false, follow: false },
};

export default function AchadosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="pt-BR" className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/70">
        <div className="container flex h-14 max-w-2xl items-center justify-between gap-4">
          <span className="text-body font-semibold tracking-tight text-foreground">Casa Prática</span>
          <span className="text-caption text-muted-foreground">achados para a casa</span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/70">
        <div className="container flex max-w-2xl flex-col gap-2 py-6 text-caption text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Casa Prática</p>
          <nav className="flex gap-4">
            <Link href="/ml/sobre" className="hover:text-foreground">
              Sobre
            </Link>
            <Link href="/ml/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
