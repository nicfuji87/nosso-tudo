/**
 * Planejamento de uma família de criativos (V2 §3, §6, §11.6) — puro e testado.
 * Decide QUAIS variantes gerar (tipo visual × cena × modo de fidelidade) e quanto
 * isso custa, antes de enfileirar qualquer job.
 */

export const TIPOS_VISUAIS = ["lifestyle_no_text", "lifestyle_text", "editorial", "product_layout"] as const;
export type TipoVisual = (typeof TIPOS_VISUAIS)[number];

export const MODOS_FIDELIDADE = ["exact_composition", "reference_generation", "original_layout"] as const;
export type ModoFidelidade = (typeof MODOS_FIDELIDADE)[number];

export const TIPO_VISUAL_LABEL: Record<TipoVisual, string> = {
  lifestyle_no_text: "Lifestyle sem texto",
  lifestyle_text: "Lifestyle com texto",
  editorial: "Editorial",
  product_layout: "Foto + layout",
};

export const MODO_FIDELIDADE_LABEL: Record<ModoFidelidade, string> = {
  exact_composition: "Composição exata",
  reference_generation: "Geração por referência",
  original_layout: "Foto original + layout",
};

export interface Mix {
  lifestyle_no_text: number;
  lifestyle_text: number;
  editorial: number;
  product_layout: number;
}

export const MIX_PADRAO: Mix = { lifestyle_no_text: 3, lifestyle_text: 2, editorial: 1, product_layout: 0 };

export interface PresetResumo {
  id: string;
  key: string;
  name: string;
  category_hint: string | null;
  text_area: "top" | "bottom" | "none";
}

export interface EntradaPlano {
  mix: Mix;
  presets: PresetResumo[]; // já filtrados: ativos e escolhidos no wizard
  caminhoCategoria: string[];
  titulo: string;
  modo: ModoFidelidade;
  /** Manual = imagem feita fora (ChatGPT/upload); o plano é o mesmo, muda o executor. */
  manual: boolean;
  headlines: string[];
  editorial: { titulo: string; pontos: string[] } | null;
}

export interface VariantePlanejada {
  visual_type: TipoVisual;
  scene_preset_id: string | null;
  scene_key: string | null;
  fidelity_mode: ModoFidelidade;
  has_text_overlay: boolean;
  headline: string | null;
  editorial_points: string[];
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Presets ordenados pela afinidade com o produto (dica de categoria casando com título/categoria). */
export function ordenarPresets(presets: PresetResumo[], caminho: string[], titulo: string): PresetResumo[] {
  const texto = normalizar(`${titulo} ${caminho.join(" ")}`);
  const pontuar = (p: PresetResumo) => {
    if (!p.category_hint) return 0;
    return p.category_hint
      .split("|")
      .map((t) => normalizar(t.trim()))
      .filter(Boolean)
      .some((t) => texto.includes(t))
      ? 1
      : 0;
  };
  return [...presets].sort((a, b) => pontuar(b) - pontuar(a));
}

/** Presets que combinam com o produto; se nenhum combinar, todos (para não ficar sem cena). */
export function presetsDoProduto(presets: PresetResumo[], caminho: string[], titulo: string): PresetResumo[] {
  const texto = normalizar(`${titulo} ${caminho.join(" ")}`);
  const combinam = presets.filter((p) =>
    (p.category_hint ?? "")
      .split("|")
      .map((t) => normalizar(t.trim()))
      .filter(Boolean)
      .some((t) => texto.includes(t)),
  );
  return combinam.length ? combinam : presets;
}

export function planejarVariantes(e: EntradaPlano): VariantePlanejada[] {
  // cicla só entre as cenas do ambiente do produto (banheiro não vira cozinha)
  const presets = presetsDoProduto(ordenarPresets(e.presets, e.caminhoCategoria, e.titulo), e.caminhoCategoria, e.titulo);
  const out: VariantePlanejada[] = [];
  let idxCena = 0;
  // cada variante "com cena" usa uma cena diferente enquanto houver (diversidade)
  const proximaCena = () => {
    if (!presets.length) return null;
    const p = presets[idxCena % presets.length]!;
    idxCena++;
    return p;
  };
  const headlines = e.headlines.filter((h) => h.trim()).map((h) => h.trim());
  let idxHeadline = 0;

  for (let i = 0; i < e.mix.lifestyle_no_text; i++) {
    const cena = proximaCena();
    out.push({
      visual_type: "lifestyle_no_text",
      scene_preset_id: cena?.id ?? null,
      scene_key: cena?.key ?? null,
      fidelity_mode: e.modo,
      has_text_overlay: false,
      headline: null,
      editorial_points: [],
    });
  }
  for (let i = 0; i < e.mix.lifestyle_text; i++) {
    const cena = proximaCena();
    const h = headlines.length ? headlines[idxHeadline++ % headlines.length]! : null;
    out.push({
      visual_type: "lifestyle_text",
      scene_preset_id: cena?.id ?? null,
      scene_key: cena?.key ?? null,
      fidelity_mode: e.modo,
      has_text_overlay: true,
      headline: h,
      editorial_points: [],
    });
  }
  for (let i = 0; i < e.mix.editorial; i++) {
    const cena = proximaCena();
    out.push({
      visual_type: "editorial",
      scene_preset_id: cena?.id ?? null,
      scene_key: cena?.key ?? null,
      // editorial prioriza a foto real (informativo, maior fidelidade)
      fidelity_mode: e.modo === "reference_generation" ? "exact_composition" : e.modo,
      has_text_overlay: true,
      headline: e.editorial?.titulo ?? headlines[0] ?? null,
      editorial_points: (e.editorial?.pontos ?? []).slice(0, 4),
    });
  }
  for (let i = 0; i < e.mix.product_layout; i++) {
    out.push({
      visual_type: "product_layout",
      scene_preset_id: null,
      scene_key: null,
      fidelity_mode: "original_layout",
      has_text_overlay: true,
      headline: headlines.length ? headlines[idxHeadline++ % headlines.length]! : null,
      editorial_points: [],
    });
  }
  return out;
}

export interface Precos {
  imagem: number; // USD por imagem gerada (na qualidade configurada)
  texto: number; // USD por chamada de texto
  visao: number; // USD por checagem de fidelidade
}

export interface Estimativa {
  chamadasImagem: number;
  chamadasTexto: number;
  chamadasVisao: number;
  jobs: number;
  custoUsd: number;
}

/** Custo estimado do lote (só conta o que vai para API paga). */
export function estimarCusto(variantes: VariantePlanejada[], p: { manual: boolean; temOpenAI: boolean; precos: Precos }): Estimativa {
  let img = 0;
  let visao = 0;
  let jobs = 2; // plano + lote
  for (const v of variantes) {
    if (!p.manual && p.temOpenAI) {
      if (v.fidelity_mode === "reference_generation") {
        img++;
        visao++;
      } else if (v.fidelity_mode === "exact_composition") {
        img++; // só o cenário
      }
    } else if (p.manual && p.temOpenAI) {
      visao++; // checagem de fidelidade do upload
    }
    jobs += v.fidelity_mode === "exact_composition" ? 3 : 2; // geração + (overlay) + pacote
    if (v.has_text_overlay) jobs++;
  }
  const texto = p.temOpenAI ? variantes.length + 1 : 0; // pacote por variante + plano
  const custo = img * p.precos.imagem + texto * p.precos.texto + visao * p.precos.visao;
  return { chamadasImagem: img, chamadasTexto: texto, chamadasVisao: visao, jobs, custoUsd: Math.round(custo * 10000) / 10000 };
}

/** Headlines e editorial de fallback (sem IA) a partir dos ângulos — só fatos do produto. */
export function textosPadrao(hooks: string[], nome: string): { headlines: string[]; editorial: { titulo: string; pontos: string[] } } {
  const hs = hooks.filter(Boolean).slice(0, 4);
  return {
    headlines: hs.length ? hs : [`Mais praticidade com ${nome}`, `Ideia simples: ${nome}`],
    editorial: {
      titulo: `Como aproveitar melhor: ${nome}`,
      pontos: ["Escolha o lugar de uso antes de comprar", "Confira as medidas no anúncio", "Mantenha o espaço livre e organizado"],
    },
  };
}
