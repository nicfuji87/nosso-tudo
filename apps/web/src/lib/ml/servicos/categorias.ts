import "server-only";
import { mlDb } from "../db";
import * as ml from "../integracoes/mercadolivre";
import type { CategoriaRow } from "../tipos";

/** Garante que a categoria existe localmente (FK de ml_products) — busca nome/caminho no ML. */
export async function garantirCategoria(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await mlDb().from("ml_categories").select("id").eq("id", id).maybeSingle();
  if (data) return id;
  try {
    await sincronizarCategoria(id);
  } catch {
    await mlDb().from("ml_categories").upsert({ id, name: id }, { onConflict: "id", ignoreDuplicates: true });
  }
  return id;
}

/** Busca a categoria no ML e grava nome, caminho e filhos (filhos sem detalhe). */
export async function sincronizarCategoria(id: string): Promise<CategoriaRow> {
  const c = await ml.categoria(id);
  const path = c.path_from_root ?? [];
  const parent = path.length >= 2 ? path[path.length - 2]!.id : null;
  const agora = new Date().toISOString();
  const { data, error } = await mlDb()
    .from("ml_categories")
    .upsert(
      {
        id: c.id,
        name: c.name,
        parent_id: parent,
        path,
        has_children: (c.children_categories?.length ?? 0) > 0,
        synced_at: agora,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao gravar categoria: ${error.message}`);
  const filhos = (c.children_categories ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    parent_id: c.id,
    path: [...path, { id: f.id, name: f.name }],
  }));
  if (filhos.length) {
    // Não sobrescreve flags (tracked/prohibited/comissão) de filhos já existentes.
    const { data: existentes } = await mlDb().from("ml_categories").select("id").in("id", filhos.map((f) => f.id));
    const ja = new Set(((existentes ?? []) as { id: string }[]).map((e) => e.id));
    const novos = filhos.filter((f) => !ja.has(f.id));
    if (novos.length) await mlDb().from("ml_categories").insert(novos);
    for (const f of filhos.filter((x) => ja.has(x.id))) {
      await mlDb().from("ml_categories").update({ name: f.name, parent_id: f.parent_id, path: f.path }).eq("id", f.id);
    }
  }
  return data as CategoriaRow;
}

/** Categorias raiz do site. */
export async function sincronizarRaiz(): Promise<number> {
  const raiz = await ml.categoriasRaiz();
  const { data: existentes } = await mlDb().from("ml_categories").select("id").in("id", raiz.map((r) => r.id));
  const ja = new Set(((existentes ?? []) as { id: string }[]).map((e) => e.id));
  const novos = raiz.filter((r) => !ja.has(r.id)).map((r) => ({ id: r.id, name: r.name, path: [{ id: r.id, name: r.name }] }));
  if (novos.length) await mlDb().from("ml_categories").insert(novos);
  for (const r of raiz.filter((x) => ja.has(x.id))) {
    await mlDb().from("ml_categories").update({ name: r.name }).eq("id", r.id);
  }
  return raiz.length;
}

export function caminhoNomes(c: Pick<CategoriaRow, "path" | "name"> | null | undefined): string[] {
  if (!c) return [];
  const p = (c.path as { name: string }[] | null) ?? [];
  return p.length ? p.map((x) => x.name) : [c.name];
}
