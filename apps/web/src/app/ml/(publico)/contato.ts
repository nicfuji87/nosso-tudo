/** Canal público de contato e privacidade da Casa Prática (exibido nas páginas públicas). */
export const CONTATO_EMAIL = "fujimoto.nicolas@gmail.com";

/** Data de vigência da política — atualizar (nas duas línguas) a cada mudança de conteúdo. */
export const POLITICA_VIGENCIA = "1º de outubro de 2026";
export const POLITICA_VIGENCIA_EN = "October 1, 2026";

/** Pares de tradução das páginas públicas (pt ↔ en). */
export const TRADUCOES: Record<string, { lang: "pt" | "en"; par: string }> = {
  "/ml/sobre": { lang: "pt", par: "/ml/about" },
  "/ml/privacidade": { lang: "pt", par: "/ml/privacy" },
  "/ml/about": { lang: "en", par: "/ml/sobre" },
  "/ml/privacy": { lang: "en", par: "/ml/privacidade" },
};
