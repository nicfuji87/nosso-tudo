export const STATUS_PAGINA = {
  draft: { label: "Rascunho", variante: "default" },
  published: { label: "Publicada", variante: "success" },
  paused: { label: "Pausada", variante: "warning" },
} as const satisfies Record<string, { label: string; variante: "default" | "success" | "warning" }>;
