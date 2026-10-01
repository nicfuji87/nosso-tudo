"use client";

import { useEffect } from "react";

/** `?tipo=` → rola até o grupo e destaca por alguns segundos. */
export function FocoGrupo({ tipo }: { tipo: string | null }) {
  useEffect(() => {
    if (!tipo) return;
    const el = document.getElementById(`grupo-${tipo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.setAttribute("data-foco", "true");
    const t = setTimeout(() => el.removeAttribute("data-foco"), 2500);
    return () => clearTimeout(t);
  }, [tipo]);
  return null;
}
