import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const COLS = [
  {
    title: "Produto",
    links: [
      { href: "#recursos", label: "Recursos" },
      { href: "#como-funciona", label: "Como funciona" },
      { href: "#precos", label: "Preços" },
    ],
  },
  {
    title: "Conta",
    links: [
      { href: "/entrar", label: "Entrar" },
      { href: "/cadastrar", label: "Criar conta" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/termos", label: "Termos de uso" },
      { href: "/privacidade", label: "Privacidade" },
      { href: "/privacidade#dpo", label: "Contato DPO" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-brand-graphite text-brand-offwhite">
      <div className="container grid gap-12 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo inverted />
          <p className="max-w-xs text-body-sm text-brand-offwhite/60">
            O sistema operacional da vida familiar. Organize as finanças da sua
            casa sem fricção.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.title} className="space-y-3">
            <p className="text-overline uppercase tracking-wide text-brand-offwhite/40">
              {col.title}
            </p>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-body-sm text-brand-offwhite/70 transition-colors hover:text-brand-offwhite"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-brand-offwhite/10">
        <div className="container flex flex-col items-center justify-between gap-2 py-6 text-caption text-brand-offwhite/50 sm:flex-row">
          <p>© 2026 Nosso Tudo. Feito no Brasil.</p>
          <p>Dados protegidos com criptografia e LGPD nativa.</p>
        </div>
      </div>
    </footer>
  );
}
