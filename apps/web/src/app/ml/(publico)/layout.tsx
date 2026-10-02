import type { Metadata } from "next";
import { Moldura } from "./moldura";

/**
 * Páginas públicas da Casa Prática (exigidas pela revisão de app do Pinterest),
 * em português (/ml/sobre, /ml/privacidade) e inglês (/ml/about, /ml/privacy).
 * Fora do route group `(painel)`: não passam por `requireMlPage`. Se `/ml` estiver
 * protegido no middleware, estas rotas precisam constar em `PUBLIC_PATHS`.
 * Não importar nada do painel aqui.
 */
export const metadata: Metadata = {
  title: { default: "Casa Prática", template: "%s · Casa Prática" },
  description: "Casa Prática — curadoria de produtos para a casa publicada no Pinterest.",
  robots: { index: true, follow: true },
};

export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return <Moldura>{children}</Moldura>;
}
