import { describe, expect, it } from "vitest";
import { estimarCusto, MIX_PADRAO, ordenarPresets, planejarVariantes, textosPadrao, type PresetResumo } from "./plano";
import { renderizarTemplate } from "./templates";

const presets: PresetResumo[] = [
  { id: "c1", key: "cozinha", name: "Cozinha", category_hint: "cozinha|pote", text_area: "top" },
  { id: "b1", key: "banheiro_claro", name: "Banheiro claro", category_hint: "banheiro|box", text_area: "top" },
  { id: "b2", key: "banheiro_escuro", name: "Banheiro escuro", category_hint: "banheiro|box", text_area: "bottom" },
  { id: "l1", key: "lavanderia", name: "Lavanderia", category_hint: "lavanderia", text_area: "top" },
];

const base = {
  mix: MIX_PADRAO,
  presets,
  caminhoCategoria: ["Casa", "Banheiro", "Acessórios"],
  titulo: "Kit 2 Prateleiras Adesivas Para Box Banheiro Preta",
  modo: "exact_composition" as const,
  manual: false,
  headlines: ["Ganhe espaço no banheiro sem reforma", "Organize o box sem furar a parede"],
  editorial: { titulo: "3 ideias para organizar o box", pontos: ["a", "b", "c"] },
};

describe("plano de família", () => {
  it("presets que combinam com a categoria vêm primeiro", () => {
    const o = ordenarPresets(presets, base.caminhoCategoria, base.titulo);
    expect(o.slice(0, 2).map((p) => p.key).sort()).toEqual(["banheiro_claro", "banheiro_escuro"]);
  });

  it("mix padrão gera 3 + 2 + 1 com cenas diferentes nas sem texto", () => {
    const v = planejarVariantes(base);
    expect(v).toHaveLength(6);
    expect(v.filter((x) => x.visual_type === "lifestyle_no_text")).toHaveLength(3);
    expect(v.filter((x) => x.visual_type === "lifestyle_text")).toHaveLength(2);
    expect(v.filter((x) => x.visual_type === "editorial")).toHaveLength(1);
    const cenasSemTexto = v.filter((x) => x.visual_type === "lifestyle_no_text").map((x) => x.scene_key);
    expect(new Set(cenasSemTexto.slice(0, 2)).size).toBe(2);
    // só cenas de banheiro para um produto de banheiro (cicla entre as compatíveis)
    expect(v.every((x) => x.scene_key?.startsWith("banheiro"))).toBe(true);
  });

  it("variantes com texto recebem headlines distintas e editorial recebe a lista", () => {
    const v = planejarVariantes(base);
    const hs = v.filter((x) => x.visual_type === "lifestyle_text").map((x) => x.headline);
    expect(hs).toEqual(base.headlines);
    const ed = v.find((x) => x.visual_type === "editorial")!;
    expect(ed.headline).toBe("3 ideias para organizar o box");
    expect(ed.editorial_points).toEqual(["a", "b", "c"]);
    expect(v.filter((x) => !x.has_text_overlay).every((x) => x.headline === null)).toBe(true);
  });

  it("editorial não usa geração por referência (prioriza produto real)", () => {
    const v = planejarVariantes({ ...base, modo: "reference_generation" });
    expect(v.find((x) => x.visual_type === "editorial")!.fidelity_mode).toBe("exact_composition");
  });

  it("estimativa de custo: composição gasta 1 imagem (cenário); referência gasta imagem + visão", () => {
    const precos = { imagem: 0.06, texto: 0.002, visao: 0.004 };
    const exata = estimarCusto(planejarVariantes(base), { manual: false, temOpenAI: true, precos });
    expect(exata.chamadasImagem).toBe(6);
    expect(exata.chamadasVisao).toBe(0);
    const ref = estimarCusto(planejarVariantes({ ...base, modo: "reference_generation" }), { manual: false, temOpenAI: true, precos });
    expect(ref.chamadasVisao).toBe(5);
    const semIa = estimarCusto(planejarVariantes(base), { manual: false, temOpenAI: false, precos });
    expect(semIa.custoUsd).toBe(0);
  });

  it("textos padrão sem IA", () => {
    const t = textosPadrao(["Gancho A"], "prateleira");
    expect(t.headlines).toEqual(["Gancho A"]);
    expect(t.editorial.pontos.length).toBe(3);
  });
});

describe("templates", () => {
  it("substitui variáveis e reporta as que faltam", () => {
    const r = renderizarTemplate("Produto {product_title} em um {scene_environment} ({scene_style}; paleta {scene_palette}).", {
      product_title: "Prateleira",
      scene_environment: "banheiro",
      scene_style: "",
      scene_palette: "branco",
    });
    expect(r.texto).toBe("Produto Prateleira em um banheiro (paleta branco).");
    expect(r.faltando).toEqual(["scene_style"]);
    expect(r.texto).not.toMatch(/[{}]/);
  });
});
