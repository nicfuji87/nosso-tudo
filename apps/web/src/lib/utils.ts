import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge não conhece nossos tokens de fontSize custom (text-body-sm,
 * text-h1, …). Sem registrá-los, ele os confunde com utilitários de COR
 * (text-primary-foreground) e descarta a cor — ex.: o botão default ficava
 * com texto preto sobre fundo grafite. Registramos os tokens no grupo
 * "font-size" para que cor e tamanho coexistam.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display-lg",
            "display-md",
            "h1",
            "h2",
            "h3",
            "h4",
            "body-lg",
            "body",
            "body-sm",
            "caption",
            "overline",
          ],
        },
      ],
    },
  },
});

/** Merge condicional de classes Tailwind sem conflitos. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
