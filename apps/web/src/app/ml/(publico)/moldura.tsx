"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTATO_EMAIL, TRADUCOES } from "./contato";

const ROTULOS = {
  pt: { sobre: "Sobre", privacidade: "Privacidade", contato: "Contato", outro: "English", hrefSobre: "/ml/sobre", hrefPriv: "/ml/privacidade" },
  en: { sobre: "About", privacidade: "Privacy", contato: "Contact", outro: "Português", hrefSobre: "/ml/about", hrefPriv: "/ml/privacy" },
} as const;

/** Cabeçalho e rodapé das páginas públicas, no idioma da página atual. */
export function Moldura({ children }: { children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/+$/, "");
  const atual = TRADUCOES[pathname] ?? { lang: "pt" as const, par: "/ml/about" };
  const r = ROTULOS[atual.lang];

  return (
    <div lang={atual.lang === "en" ? "en" : "pt-BR"} className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/70">
        <div className="container flex h-16 max-w-3xl items-center justify-between gap-4">
          <Link href={r.hrefSobre} className="text-body font-semibold tracking-tight text-foreground">
            Casa Prática
          </Link>
          <nav className="flex items-center gap-5 text-body-sm text-muted-foreground">
            <Link href={r.hrefSobre} className="hover:text-foreground">
              {r.sobre}
            </Link>
            <Link href={r.hrefPriv} className="hover:text-foreground">
              {r.privacidade}
            </Link>
            <Link
              href={atual.par}
              hrefLang={atual.lang === "en" ? "pt-BR" : "en"}
              className="rounded-md border border-border/70 px-2 py-1 hover:text-foreground"
            >
              {r.outro}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/70">
        <div className="container flex max-w-3xl flex-col gap-2 py-8 text-body-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Casa Prática</p>
          <p>
            {r.contato}:{" "}
            <a href={`mailto:${CONTATO_EMAIL}`} className="font-medium text-foreground underline-offset-2 hover:underline">
              {CONTATO_EMAIL}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
