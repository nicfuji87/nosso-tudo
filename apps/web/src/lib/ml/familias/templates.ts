/**
 * Renderização de templates de prompt versionados (V2 §8) — pura e testada.
 * Placeholders `{nome}`; variável ausente vira string vazia e é reportada,
 * para o prompt nunca sair com chaves literais.
 */
export function renderizarTemplate(corpo: string, vars: Record<string, string | null | undefined>): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  const texto = corpo
    .replace(/\{([a-z_]+)\}/g, (_, k: string) => {
      const v = vars[k];
      if (v == null || v === "") {
        faltando.push(k);
        return "";
      }
      return v;
    })
    .replace(/\(\s*;\s*/g, "(")
    .replace(/;\s*;/g, ";")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
  return { texto, faltando: Array.from(new Set(faltando)) };
}

export const AREA_TEXTO_LABEL = { top: "terço superior", bottom: "terço inferior", none: "nenhuma área" } as const;
export const POSICAO_PRODUTO_LABEL = { top: "inferior central", bottom: "superior central", none: "central" } as const;
