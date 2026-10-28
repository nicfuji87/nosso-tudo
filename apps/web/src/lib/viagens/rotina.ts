import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GRUPOS_DESTINO, nomeAeroporto, regiaoDoAeroporto } from "@/lib/viagens/aeroportos";
import { cotacaoUsdBrl } from "@/lib/viagens/cambio";
import { FONTES_SEATS } from "@/lib/viagens/milheiro";
import {
  agregarMinimos,
  avaliarPromocoesDinheiro,
  avaliarPromocoesMilhas,
  chaveHistorico,
  mesDoVoo,
  type MinimoRota,
  type OfertaDinheiro,
} from "@/lib/viagens/promocoes-calc";
import {
  custearOferta,
  janelasDeBusca,
  montarCombinacoes,
  somarDias,
  type Cabine,
  type Combinacao,
  type OfertaMilhas,
  type PrecoMilheiro,
} from "@/lib/viagens/radar-calc";
import {
  COLS_CONFIG,
  COLS_ROTA,
  configPadrao,
  milheiroDoWorkspace,
  toConfig,
  toRota,
  type ConfigRadar,
  type RotaRadar,
} from "@/lib/viagens/radar-dados";
import { buscarMilhas, CotaEsgotadaError } from "@/lib/viagens/seats-aero";
import { buscarDinheiro, chaveSerpApi, explorarDestinos, usoMensalSerpApi } from "@/lib/viagens/serpapi";
import { enviarResumoWhatsapp, montarMensagem, type ItemAvisoPromo, type ItemAvisoRota } from "@/lib/viagens/notificar";

/**
 * Rotina diária de viagens. Chamada pelo pg_cron (batidas a cada 5 min entre
 * 09h e 11h UTC) e pelo botão "Atualizar agora".
 *
 * Cada batida faz só o que está PENDENTE no dia, dentro de um orçamento de
 * tempo — por isso é seguro chamar várias vezes: rota já processada hoje,
 * varredura de promoções já feita e aviso já enviado são pulados (a não ser
 * com `forcar`, usado pelo botão manual de um workspace).
 *
 * Ordem: rotas do radar → promoções (milhas + dinheiro) → resumo no WhatsApp.
 */

export interface ResumoBatida {
  pulada?: string;
  rotas: { ok: number; erro: number; pendentes: number };
  promocoes: { workspaces: number; milhas: number; dinheiro: number } | null;
  avisos: { enviados: number; erros: string[] };
  cambio: number;
  parcial: boolean;
  erros: string[];
  tempoMs: number;
}

interface Contexto {
  hoje: string;
  cambio: number;
  inicio: number;
  orcamentoMs: number;
  forcar: boolean;
  milheiro: Map<string, Awaited<ReturnType<typeof milheiroDoWorkspace>>>;
  configs: Map<string, ConfigRadar>;
  serpapiUsadas: number | null;
}

const restante = (c: Contexto) => c.orcamentoMs - (Date.now() - c.inicio);

async function milheiroDe(c: Contexto, ws: string) {
  if (!c.milheiro.has(ws)) c.milheiro.set(ws, await milheiroDoWorkspace(ws));
  return c.milheiro.get(ws)!;
}

function fontesValidas(programas: string[]): string[] {
  return programas.filter((p) => p in FONTES_SEATS);
}

/** SerpApi ainda tem orçamento no mês para `n` buscas? */
async function serpDisponivel(c: Contexto, cfg: ConfigRadar | undefined, n = 1): Promise<boolean> {
  if (!(await chaveSerpApi())) return false;
  if (c.serpapiUsadas === null) c.serpapiUsadas = await usoMensalSerpApi();
  const teto = cfg?.serpapiMensalMax ?? 240;
  return c.serpapiUsadas + n <= teto;
}

// ---------------------------------------------------------------------------
// Rotas do radar
// ---------------------------------------------------------------------------

function serializarCombo(c: Combinacao) {
  const perna = (o: Combinacao["ida"]) => ({
    origem: o.origem,
    destino: o.destino,
    data: o.data,
    programa: o.programa,
    milhas: o.milhas,
    taxasBrlCents: o.taxasBrlCents,
    custoCents: o.custoCents,
    fonteCusto: o.fonteCusto,
    assentos: o.assentos,
    direto: o.direto,
    companhias: o.companhias,
    atualizadoEm: o.atualizadoEm,
  });
  return {
    ida: perna(c.ida),
    volta: c.volta ? perna(c.volta) : null,
    dias: c.dias,
    milhasPp: c.milhasPp,
    taxasPpCents: c.taxasPpCents,
    custoPpCents: c.custoPpCents,
    programas: c.programas,
    assentos: c.assentos,
    mesmoAeroporto: c.mesmoAeroporto,
  };
}

async function processarRota(c: Contexto, rota: RotaRadar): Promise<void> {
  const admin = createAdminClient();
  const janelas = janelasDeBusca(rota.dataInicio, rota.dataFim, c.hoje, rota.duracaoMin);
  if (!janelas) {
    await admin
      .from("viagem_radar_rotas")
      .update({ ultima_execucao: new Date().toISOString(), ultimo_erro: "A janela de datas já passou." })
      .eq("id", rota.id);
    return;
  }
  const m = await milheiroDe(c, rota.workspaceId);
  const programas = fontesValidas(rota.programas.length ? rota.programas : m.programasPadrao);

  const idas = await buscarMilhas({
    origens: rota.origens,
    destinos: rota.destinos,
    de: janelas.ida.de,
    ate: janelas.ida.ate,
    cabines: [rota.cabine],
    programas,
    apenasDireto: rota.apenasDireto,
    maisBaratoPrimeiro: true,
  });
  const voltas = janelas.volta
    ? await buscarMilhas({
        origens: rota.destinos,
        destinos: rota.origens,
        de: janelas.volta.de,
        ate: janelas.volta.ate,
        cabines: [rota.cabine],
        programas,
        apenasDireto: rota.apenasDireto,
        maisBaratoPrimeiro: true,
      })
    : { ofertas: [] as OfertaMilhas[], chamadas: 0 };

  const combos = montarCombinacoes(idas.ofertas, voltas.ofertas, {
    pessoas: rota.pessoas,
    duracaoMin: rota.duracaoMin,
    duracaoMax: rota.duracaoMax,
    precos: m.precos,
    cambioUsdBrl: c.cambio,
    limite: 6,
  });

  const [melhor, ...alternativas] = combos;
  if (melhor) {
    await admin.from("viagem_radar_snapshots").upsert(
      {
        workspace_id: rota.workspaceId,
        rota_id: rota.id,
        data_ref: c.hoje,
        tipo: "milhas",
        milhas_pp: melhor.milhasPp,
        taxas_pp_cents: melhor.taxasPpCents,
        custo_pp_cents: melhor.custoPpCents,
        programas: melhor.programas,
        melhor: { ...serializarCombo(melhor), cambio: c.cambio, encontradas: idas.ofertas.length + voltas.ofertas.length },
        alternativas: alternativas.map(serializarCombo),
      },
      { onConflict: "rota_id,data_ref,tipo" },
    );
  }

  // Dinheiro: a cada 3 dias por rota (o plano gratuito do SerpApi é curto).
  if (rota.incluirDinheiro && (await serpDisponivel(c, c.configs.get(rota.workspaceId)))) {
    const { data: ultimo } = await admin
      .from("viagem_radar_snapshots")
      .select("data_ref")
      .eq("rota_id", rota.id)
      .eq("tipo", "dinheiro")
      .order("data_ref", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ultimaData = (ultimo as { data_ref: string } | null)?.data_ref ?? null;
    // Nem o "Atualizar agora" fura esse intervalo: cada clique gastaria uma busca paga.
    const vencido = !ultimaData || ultimaData <= somarDias(c.hoje, -3);
    if (vencido) {
      const base = combos[0];
      const dataIda = base?.ida.data ?? janelas.ida.de;
      const dataVolta = janelas.volta ? (base?.volta?.data ?? somarDias(dataIda, rota.duracaoMin ?? 7)) : null;
      c.serpapiUsadas = (c.serpapiUsadas ?? 0) + 1;
      const preco = await buscarDinheiro({
        origens: rota.origens,
        destinos: rota.destinos,
        dataIda,
        dataVolta,
        cabine: rota.cabine,
        apenasDireto: rota.apenasDireto,
      });
      if (preco) {
        await admin.from("viagem_radar_snapshots").upsert(
          {
            workspace_id: rota.workspaceId,
            rota_id: rota.id,
            data_ref: c.hoje,
            tipo: "dinheiro",
            custo_pp_cents: preco.precoCents,
            programas: [],
            melhor: preco,
            alternativas: [],
          },
          { onConflict: "rota_id,data_ref,tipo" },
        );
      }
    }
  }

  await admin
    .from("viagem_radar_rotas")
    .update({
      ultima_execucao: new Date().toISOString(),
      ultimo_erro: combos.length ? null : "Nenhuma disponibilidade em milhas para essa combinação hoje.",
    })
    .eq("id", rota.id);
}

// ---------------------------------------------------------------------------
// Promoções
// ---------------------------------------------------------------------------

async function gravarHistorico(linhas: Record<string, unknown>[]) {
  const admin = createAdminClient();
  for (let i = 0; i < linhas.length; i += 500) {
    await admin
      .from("viagem_precos_historico")
      .upsert(linhas.slice(i, i + 500), { onConflict: "data_ref,origem,destino,programa,cabine,mes_voo" });
  }
}

/** Mínimos diários anteriores (até 45 dias), por chave de histórico. */
async function lerHistorico(hoje: string, origens: string[], programas: string[]): Promise<Map<string, number[]>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("viagem_precos_historico")
    .select("origem, destino, programa, cabine, mes_voo, milhas_min, preco_min_cents")
    .gte("data_ref", somarDias(hoje, -45))
    .lt("data_ref", hoje)
    .in("origem", origens)
    .in("programa", programas)
    .limit(50_000);
  const mapa = new Map<string, number[]>();
  for (const r of (data as
    | {
        origem: string;
        destino: string;
        programa: string;
        cabine: string;
        mes_voo: string;
        milhas_min: number | null;
        preco_min_cents: number | string | null;
      }[]
    | null) ?? []) {
    const v = r.programa === "dinheiro" ? Number(r.preco_min_cents) : Number(r.milhas_min);
    if (!v) continue;
    const k = chaveHistorico(r.origem, r.destino, r.programa, r.cabine, r.mes_voo);
    mapa.set(k, [...(mapa.get(k) ?? []), v]);
  }
  return mapa;
}

async function processarPromocoes(c: Contexto, configs: ConfigRadar[]): Promise<{ milhas: number; dinheiro: number; parcial: boolean }> {
  const admin = createAdminClient();
  const programasPorWs = new Map<string, string[]>();
  for (const cfg of configs) {
    const m = await milheiroDe(c, cfg.workspaceId);
    programasPorWs.set(cfg.workspaceId, fontesValidas(cfg.programas.length ? cfg.programas : m.programasPadrao));
  }
  const origens = [...new Set(configs.flatMap((x) => x.origensPromo))];
  const programas = [...new Set([...programasPorWs.values()].flat())];
  const cabines = [...new Set(configs.flatMap((x) => x.cabinesPromo))] as Cabine[];

  // 1. Milhas: uma busca por grupo de destino, todas as origens juntas.
  const ofertas: OfertaMilhas[] = [];
  let parcial = false;
  for (const g of GRUPOS_DESTINO.filter((x) => x.varreduraPromo)) {
    if (restante(c) < 20_000) {
      parcial = true;
      break;
    }
    const r = await buscarMilhas({
      origens,
      destinos: g.aeroportos.filter((a) => !origens.includes(a)),
      de: somarDias(c.hoje, 1),
      ate: somarDias(c.hoje, 330),
      cabines,
      programas,
      maisBaratoPrimeiro: true,
      maxPaginas: 1,
    });
    ofertas.push(...r.ofertas);
  }
  if (parcial) return { milhas: 0, dinheiro: 0, parcial };

  const minimos = agregarMinimos(ofertas);
  await gravarHistorico(
    minimos.map((m) => ({
      data_ref: c.hoje,
      origem: m.origem,
      destino: m.destino,
      programa: m.programa,
      cabine: m.cabine,
      mes_voo: m.mesVoo,
      milhas_min: m.milhasMin,
      taxas_min_cents: m.taxasMinCents,
      n: m.n,
    })),
  );

  // 2. Dinheiro: Google Travel Explore, uma busca por origem (compartilhada entre workspaces).
  //    Origem já explorada hoje (ex.: clique repetido em "Atualizar agora") não gasta
  //    outra busca paga: as promoções em dinheiro de hoje ficam como estão.
  const explore = new Map<string, OfertaDinheiro[]>();
  const querDinheiro = configs.filter((x) => x.dinheiroPromo);
  const { data: jaHoje } = await admin
    .from("viagem_precos_historico")
    .select("origem")
    .eq("data_ref", c.hoje)
    .eq("programa", "dinheiro")
    .in("origem", origens.length ? origens : ["---"]);
  const exploradasHoje = new Set(((jaHoje as { origem: string }[] | null) ?? []).map((r) => r.origem));
  const aExplorar = [...new Set(querDinheiro.flatMap((x) => x.origensPromo))].filter((o) => !exploradasHoje.has(o));
  if (aExplorar.length && (await serpDisponivel(c, querDinheiro[0], aExplorar.length))) {
    for (const o of aExplorar) {
      if (restante(c) < 10_000) break;
      try {
        c.serpapiUsadas = (c.serpapiUsadas ?? 0) + 1;
        explore.set(o, await explorarDestinos(o));
      } catch (e) {
        console.error("[viagens] explore falhou", o, e);
      }
    }
    await gravarHistorico(
      [...explore.values()].flat().map((d) => ({
        data_ref: c.hoje,
        origem: d.origem,
        destino: d.destino,
        programa: "dinheiro",
        cabine: "economy",
        mes_voo: mesDoVoo(d.dataIda),
        preco_min_cents: d.precoCents,
        n: 1,
      })),
    );
  }

  const historico = await lerHistorico(c.hoje, origens, [...programas, "dinheiro"]);

  // 3. Por workspace: filtra pelas escolhas dele, avalia e grava.
  let totalMilhas = 0;
  let totalDinheiro = 0;
  for (const cfg of configs) {
    const progs = new Set(programasPorWs.get(cfg.workspaceId));
    const doWs: MinimoRota[] = minimos.filter(
      (m) => cfg.origensPromo.includes(m.origem) && progs.has(m.programa) && cfg.cabinesPromo.includes(m.cabine),
    );
    const { precos } = await milheiroDe(c, cfg.workspaceId);
    const promosMilhas = avaliarPromocoesMilhas(doWs, historico, {
      descontoMinimoPct: cfg.descontoMinimoPct,
      pessoas: cfg.pessoasPromo,
    }).slice(0, 80);

    const linhas: Record<string, unknown>[] = promosMilhas.map((p) => {
      const o = custearOferta(p.minimo.oferta, precos as PrecoMilheiro, c.cambio);
      return {
        workspace_id: cfg.workspaceId,
        data_ref: c.hoje,
        tipo: "milhas",
        origem: p.minimo.origem,
        destino: p.minimo.destino,
        destino_nome: nomeAeroporto(p.minimo.destino),
        regiao: regiaoDoAeroporto(p.minimo.destino),
        programa: p.minimo.programa,
        cabine: p.minimo.cabine,
        data_voo: p.minimo.oferta.data,
        milhas: p.minimo.milhasMin,
        taxas_cents: o.taxasBrlCents,
        custo_cents: o.custoCents,
        referencia_cents: p.referencia.valor,
        referencia_fonte: p.referencia.fonte,
        desconto_pct: p.descontoPct,
        assentos: p.minimo.oferta.assentos,
        direto: p.minimo.oferta.direto,
        companhias: p.minimo.oferta.companhias,
        score: p.score,
        payload: { fonteCusto: o.fonteCusto, datasNoMes: p.minimo.n, atualizadoEm: p.minimo.oferta.atualizadoEm },
      };
    });

    if (cfg.dinheiroPromo) {
      const doWsDinheiro = cfg.origensPromo.flatMap((o) => explore.get(o) ?? []);
      const promosDinheiro = avaliarPromocoesDinheiro(doWsDinheiro, historico, { descontoMinimoPct: cfg.descontoMinimoPct });
      // Até 12 por origem, mantendo a ordem do score.
      const porOrigem = new Map<string, number>();
      for (const p of promosDinheiro) {
        const n = porOrigem.get(p.oferta.origem) ?? 0;
        if (n >= 12) continue;
        porOrigem.set(p.oferta.origem, n + 1);
        linhas.push({
          workspace_id: cfg.workspaceId,
          data_ref: c.hoje,
          tipo: "dinheiro",
          origem: p.oferta.origem,
          destino: p.oferta.destino,
          destino_nome: p.oferta.destinoNome || nomeAeroporto(p.oferta.destino),
          regiao: regiaoDoAeroporto(p.oferta.destino),
          programa: "",
          cabine: "economy",
          data_voo: p.oferta.dataIda,
          preco_cents: p.oferta.precoCents,
          custo_cents: p.oferta.precoCents,
          referencia_cents: p.referencia?.valor ?? null,
          referencia_fonte: p.referencia?.fonte ?? null,
          desconto_pct: p.descontoPct,
          direto: p.oferta.paradas === 0,
          companhias: p.oferta.companhia,
          score: p.score,
          payload: { dataVolta: p.oferta.dataVolta, paradas: p.oferta.paradas },
        });
        totalDinheiro++;
      }
    }

    // Substitui a varredura de hoje deste workspace (mantém o que já foi avisado).
    // Se nenhuma origem foi explorada em dinheiro agora, as de dinheiro de hoje ficam.
    const refezDinheiro = cfg.dinheiroPromo && cfg.origensPromo.some((o) => explore.has(o));
    let del = admin
      .from("viagem_promocoes")
      .delete()
      .eq("workspace_id", cfg.workspaceId)
      .eq("data_ref", c.hoje)
      .is("notificado_em", null);
    if (!refezDinheiro) del = del.eq("tipo", "milhas");
    await del;
    for (let i = 0; i < linhas.length; i += 200) {
      await admin
        .from("viagem_promocoes")
        .upsert(linhas.slice(i, i + 200), {
          onConflict: "workspace_id,data_ref,tipo,origem,destino,programa,cabine",
          ignoreDuplicates: true,
        });
    }
    totalMilhas += promosMilhas.length;
    await admin.from("viagem_radar_config").update({ ultima_promo_em: new Date().toISOString() }).eq("workspace_id", cfg.workspaceId);
  }
  return { milhas: totalMilhas, dinheiro: totalDinheiro, parcial: false };
}

// ---------------------------------------------------------------------------
// Aviso no WhatsApp
// ---------------------------------------------------------------------------

async function avisar(c: Contexto, cfg: ConfigRadar): Promise<{ enviado: boolean; erros: string[] }> {
  const admin = createAdminClient();
  const { data: promos } = await admin
    .from("viagem_promocoes")
    .select("id, tipo, origem, destino, destino_nome, programa, data_voo, milhas, custo_cents, preco_cents, desconto_pct")
    .eq("workspace_id", cfg.workspaceId)
    .eq("data_ref", c.hoje)
    .is("notificado_em", null)
    .not("desconto_pct", "is", null)
    .gte("desconto_pct", cfg.descontoMinimoPct)
    .order("score", { ascending: false })
    .limit(20);
  type Row = {
    id: string;
    tipo: "milhas" | "dinheiro";
    origem: string;
    destino: string;
    destino_nome: string | null;
    programa: string;
    data_voo: string | null;
    milhas: number | null;
    custo_cents: number | string | null;
    preco_cents: number | string | null;
    desconto_pct: number | string | null;
  };
  const rows = (promos as Row[] | null) ?? [];
  const itens: ItemAvisoPromo[] = [
    ...rows.filter((r) => r.tipo === "milhas").slice(0, 5),
    ...rows.filter((r) => r.tipo === "dinheiro").slice(0, 3),
  ].map((r) => ({
    id: r.id,
    tipo: r.tipo,
    origem: r.origem,
    destino: r.destino,
    destinoNome: r.destino_nome,
    programa: r.programa,
    dataVoo: r.data_voo,
    milhas: r.milhas,
    custoCents: r.custo_cents == null ? null : Number(r.custo_cents),
    precoCents: r.preco_cents == null ? null : Number(r.preco_cents),
    descontoPct: r.desconto_pct == null ? null : Number(r.desconto_pct),
  }));

  // Metas das rotas do radar batidas hoje.
  const { data: rotasRows } = await admin
    .from("viagem_radar_rotas")
    .select(COLS_ROTA)
    .eq("workspace_id", cfg.workspaceId)
    .eq("ativo", true);
  const rotas = ((rotasRows as unknown as Parameters<typeof toRota>[0][] | null) ?? []).map(toRota);
  const comMeta = rotas.filter((r) => r.alertaMilhasPp || r.alertaReaisPpCents);
  const metas: ItemAvisoRota[] = [];
  if (comMeta.length) {
    const { data: snaps } = await admin
      .from("viagem_radar_snapshots")
      .select("rota_id, milhas_pp, custo_pp_cents, programas, melhor")
      .in("rota_id", comMeta.map((r) => r.id))
      .eq("data_ref", c.hoje)
      .eq("tipo", "milhas");
    for (const s of (snaps as { rota_id: string; milhas_pp: number | null; custo_pp_cents: number | string | null; programas: string[]; melhor: { ida?: { data?: string } } }[] | null) ?? []) {
      const r = comMeta.find((x) => x.id === s.rota_id);
      if (!r) continue;
      const custo = s.custo_pp_cents == null ? null : Number(s.custo_pp_cents);
      const bateuMilhas = r.alertaMilhasPp && s.milhas_pp != null && s.milhas_pp <= r.alertaMilhasPp;
      const bateuReais = r.alertaReaisPpCents && custo != null && custo <= r.alertaReaisPpCents;
      if (bateuMilhas || bateuReais) {
        metas.push({
          nome: r.nome,
          texto: `${(s.milhas_pp ?? 0).toLocaleString("pt-BR")} milhas/pessoa${custo ? ` (≈ R$ ${Math.round(custo / 100).toLocaleString("pt-BR")})` : ""}, ida em ${s.melhor?.ida?.data?.split("-").reverse().join("/") ?? "?"}`,
        });
      }
    }
  }

  if (itens.length === 0 && metas.length === 0) return { enviado: false, erros: [] };

  const { data: runtime } = await admin.from("ml_settings").select("value").eq("key", "runtime").maybeSingle();
  const appUrl = ((runtime as { value: { app_url?: string } } | null)?.value?.app_url as string | undefined) ?? null;
  const texto = montarMensagem({ hoje: c.hoje, promos: itens, rotas: metas, appUrl });
  const r = await enviarResumoWhatsapp(cfg.workspaceId, texto);
  if (r.enviados > 0) {
    const agora = new Date().toISOString();
    if (itens.length) await admin.from("viagem_promocoes").update({ notificado_em: agora }).in("id", itens.map((i) => i.id));
    await admin.from("viagem_radar_config").update({ ultimo_aviso_em: agora }).eq("workspace_id", cfg.workspaceId);
  }
  return { enviado: r.enviados > 0, erros: r.erros };
}

// ---------------------------------------------------------------------------
// Batida
// ---------------------------------------------------------------------------

export async function rodarBatida(opts: {
  orcamentoMs: number;
  origem: "pg_cron" | "manual";
  workspaceId?: string;
  forcar?: boolean;
}): Promise<ResumoBatida> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioDoDia = `${hoje}T00:00:00Z`;
  const resumo: ResumoBatida = {
    rotas: { ok: 0, erro: 0, pendentes: 0 },
    promocoes: null,
    avisos: { enviados: 0, erros: [] },
    cambio: 0,
    parcial: false,
    erros: [],
    tempoMs: 0,
  };

  // Evita duas batidas automáticas em paralelo.
  if (opts.origem === "pg_cron") {
    const { data: rodando } = await admin
      .from("viagem_cron_execucoes")
      .select("id")
      .eq("status", "rodando")
      .gte("iniciado_em", new Date(Date.now() - 6 * 60_000).toISOString())
      .limit(1);
    if (rodando?.length) return { ...resumo, pulada: "outra batida em andamento" };
  }

  const { data: exec } = await admin
    .from("viagem_cron_execucoes")
    .insert({ origem: opts.origem, workspace_id: opts.workspaceId ?? null })
    .select("id")
    .single();
  const execId = (exec as { id: string } | null)?.id;

  const cambio = await cotacaoUsdBrl();
  resumo.cambio = cambio.valor;

  // Configs (todas as relevantes nesta batida).
  let qCfg = admin.from("viagem_radar_config").select(COLS_CONFIG);
  if (opts.workspaceId) qCfg = qCfg.eq("workspace_id", opts.workspaceId);
  const { data: cfgRows } = await qCfg;
  const configs = new Map(
    ((cfgRows as unknown as Parameters<typeof toConfig>[0][] | null) ?? []).map((r) => {
      const cfg = toConfig(r);
      return [cfg.workspaceId, cfg] as const;
    }),
  );

  const c: Contexto = {
    hoje,
    cambio: cambio.valor,
    inicio,
    orcamentoMs: opts.orcamentoMs,
    forcar: !!opts.forcar,
    milheiro: new Map(),
    configs,
    serpapiUsadas: null,
  };

  try {
    // 1. Rotas pendentes.
    let qRotas = admin.from("viagem_radar_rotas").select(COLS_ROTA).eq("ativo", true);
    if (opts.workspaceId) qRotas = qRotas.eq("workspace_id", opts.workspaceId);
    if (!opts.forcar) qRotas = qRotas.or(`ultima_execucao.is.null,ultima_execucao.lt.${inicioDoDia}`);
    const { data: rotasRows } = await qRotas.order("ultima_execucao", { ascending: true, nullsFirst: true });
    const rotas = ((rotasRows as unknown as Parameters<typeof toRota>[0][] | null) ?? []).map(toRota);

    for (const rota of rotas) {
      if (restante(c) < 25_000) {
        resumo.parcial = true;
        resumo.rotas.pendentes++;
        continue;
      }
      try {
        await processarRota(c, rota);
        resumo.rotas.ok++;
      } catch (e) {
        resumo.rotas.erro++;
        const msg = e instanceof Error ? e.message : String(e);
        resumo.erros.push(`${rota.nome}: ${msg}`);
        if (!(e instanceof CotaEsgotadaError)) {
          await admin
            .from("viagem_radar_rotas")
            .update({ ultima_execucao: new Date().toISOString(), ultimo_erro: msg.slice(0, 300) })
            .eq("id", rota.id);
        }
        if (e instanceof CotaEsgotadaError) break;
      }
    }

    // 2. Promoções.
    const pendentesPromo = [...configs.values()].filter(
      (x) => x.origensPromo.length > 0 && (opts.forcar || !x.ultimaPromoEm || x.ultimaPromoEm < inicioDoDia),
    );
    if (pendentesPromo.length && !resumo.parcial && restante(c) > 40_000) {
      try {
        const r = await processarPromocoes(c, pendentesPromo);
        resumo.promocoes = { workspaces: pendentesPromo.length, milhas: r.milhas, dinheiro: r.dinheiro };
        if (r.parcial) resumo.parcial = true;
      } catch (e) {
        resumo.erros.push(`promoções: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (pendentesPromo.length) {
      resumo.parcial = true;
    }

    // 3. Aviso: só na rotina automática (o botão manual não dispara WhatsApp) e
    //    só depois que tudo do dia terminou para o workspace.
    if (!resumo.parcial && opts.origem === "pg_cron") {
      const { data: frescos } = await admin.from("viagem_radar_config").select(COLS_CONFIG).in("workspace_id", [...configs.keys()]);
      for (const cfg of ((frescos as unknown as Parameters<typeof toConfig>[0][] | null) ?? []).map(toConfig)) {
        if (!cfg.avisoWhatsapp) continue;
        if (cfg.ultimoAvisoEm && cfg.ultimoAvisoEm >= inicioDoDia) continue;
        if (cfg.origensPromo.length && (!cfg.ultimaPromoEm || cfg.ultimaPromoEm < inicioDoDia)) continue;
        try {
          const r = await avisar(c, cfg);
          if (r.enviado) resumo.avisos.enviados++;
          resumo.avisos.erros.push(...r.erros);
        } catch (e) {
          resumo.avisos.erros.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
  } catch (e) {
    resumo.erros.push(e instanceof Error ? e.message : String(e));
  }

  resumo.tempoMs = Date.now() - inicio;
  if (execId) {
    await admin
      .from("viagem_cron_execucoes")
      .update({
        terminado_em: new Date().toISOString(),
        status: resumo.erros.length ? (resumo.rotas.ok || resumo.promocoes ? "parcial" : "erro") : resumo.parcial ? "parcial" : "ok",
        resumo,
        erro: resumo.erros.join(" | ").slice(0, 1000) || null,
      })
      .eq("id", execId);
  }
  return resumo;
}

/** Garante a config do workspace (criada com os programas que a família alcança). */
export async function garantirConfig(workspaceId: string): Promise<ConfigRadar> {
  const admin = createAdminClient();
  const { data } = await admin.from("viagem_radar_config").select(COLS_CONFIG).eq("workspace_id", workspaceId).maybeSingle();
  if (data) return toConfig(data as unknown as Parameters<typeof toConfig>[0]);
  const { programasPadrao } = await milheiroDoWorkspace(workspaceId);
  const padrao = configPadrao(workspaceId, programasPadrao);
  await admin.from("viagem_radar_config").insert({ workspace_id: workspaceId, programas: padrao.programas });
  return { ...padrao, salvo: true };
}
