import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supa = ReturnType<typeof createClient>;

function blocos<T>(lista: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

/** Lê linhas por id em blocos (evita URL gigante no PostgREST). */
export async function porIds<T extends { id: string }>(supabase: Supa, tabela: string, colunas: string, ids: (string | null | undefined)[]): Promise<Map<string, T>> {
  const unicos = Array.from(new Set(ids.filter((x): x is string => Boolean(x))));
  const mapa = new Map<string, T>();
  if (!unicos.length) return mapa;
  const resultados = await Promise.all(blocos(unicos).map((b) => supabase.from(tabela).select(colunas).in("id", b)));
  for (const r of resultados) for (const row of (r.data ?? []) as unknown as T[]) mapa.set(row.id, row);
  return mapa;
}
