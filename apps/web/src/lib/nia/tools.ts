import "server-only";
import type { z } from "zod";
import {
  buscarMatchEstabelecimento,
  getGastosPorCategoria,
  getResumoMes,
  listCartoes,
  listCategorias,
  listColecoes,
  listContas,
  listEntidades,
  listMetas,
  listOrcamentos,
  listTransacoes,
} from "@/lib/db/queries";
import { formatBRL, formatDate } from "@/lib/format";
import { normalizarTexto } from "@/lib/normalize";
import {
  consultarCadastrosArgs,
  consultarGastosArgs,
  criarCartaoArgs,
  criarCategoriaArgs,
  criarCompromissoArgs,
  criarContaArgs,
  criarMetaArgs,
  criarOrcamentoArgs,
  criarPessoaArgs,
  lancarTransacaoArgs,
  lembrarFatoArgs,
  listarTransacoesArgs,
  type NiaWidget,
  type NivelConfirmacao,
} from "@/lib/nia/schemas";
import { registrarAcao } from "@/lib/nia/store";

export interface NiaToolContext {
  workspaceId: string;
  profileId: string;
  conversaId: string;
  /** Imagens/PDFs anexados neste turno (política de retenção). */
  docsTurno?: { midiaId: string }[];
  /** Coletor de mídias que a Nia decidiu manter (preenchido por guardar_documento). */
  reter?: string[];
}

export interface NiaToolResult {
  /** Texto que volta ao modelo como resultado da ferramenta. */
  texto: string;
  /** Widget interativo para o cliente renderizar (opcional). */
  widget?: NiaWidget;
}

export interface NiaTool {
  nome: string;
  descricao: string;
  /** JSON Schema dos argumentos, no formato que os provedores de LLM esperam. */
  inputSchema: Record<string, unknown>;
  /** Validação + execução. `args` vem cru do modelo. */
  executar: (args: unknown, ctx: NiaToolContext) => Promise<NiaToolResult>;
  nivel: NivelConfirmacao;
}

function valida<S extends z.ZodTypeAny>(schema: S, args: unknown): z.infer<S> {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Argumentos inválidos.");
  }
  return parsed.data;
}

const consultarGastos: NiaTool = {
  nome: "consultar_gastos",
  descricao:
    "Consulta o resumo financeiro do mês atual (receitas, despesas, saldo) e os gastos por categoria. Use sempre que o usuário perguntar sobre quanto gastou ou recebeu.",
  nivel: "auto",
  inputSchema: {
    type: "object",
    properties: {
      periodo: { type: "string", enum: ["mes_atual"], description: "Período da consulta." },
    },
  },
  async executar(args, ctx) {
    valida(consultarGastosArgs, args);
    const [resumo, categorias] = await Promise.all([
      getResumoMes(ctx.workspaceId),
      getGastosPorCategoria(ctx.workspaceId),
    ]);
    const widget: NiaWidget = {
      tipo: "resumo_periodo",
      titulo: "Resumo do mês",
      receitas: resumo.receitas,
      despesas: resumo.despesas,
      saldo: resumo.saldo,
      categorias: categorias.slice(0, 6).map((c) => ({
        nome: c.categoria_nome,
        total: c.total,
        cor: c.cor,
      })),
    };
    const texto = `Saldo do mês: ${formatBRL(resumo.saldo)} (receitas ${formatBRL(
      resumo.receitas,
    )}, despesas ${formatBRL(resumo.despesas)}).`;
    return { texto, widget };
  },
};

const consultarCadastros: NiaTool = {
  nome: "consultar_cadastros",
  descricao:
    "Lê os cadastros da família: pessoas/grupos, contas bancárias, cartões, categorias ou compromissos (compras coletivas). Use sempre que o usuário perguntar o que ele já tem cadastrado ('quantas pessoas tenho?', 'quais meus cartões?', 'minhas categorias').",
  nivel: "auto",
  inputSchema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["pessoas", "contas", "cartoes", "categorias", "compromissos", "metas", "orcamentos"],
        description: "O que listar.",
      },
    },
    required: ["tipo"],
  },
  async executar(args, ctx) {
    const { tipo } = valida(consultarCadastrosArgs, args);
    if (tipo === "pessoas") {
      const list = await listEntidades(ctx.workspaceId);
      const nomes = list.map((e) => `${e.nome} (${e.tipo})`).join(", ") || "nenhuma";
      return { texto: `${list.length} pessoa(s)/grupo(s): ${nomes}.` };
    }
    if (tipo === "contas") {
      const list = await listContas(ctx.workspaceId);
      const nomes = list.map((c) => `${c.apelido} (${c.banco})`).join(", ") || "nenhuma";
      return { texto: `${list.length} conta(s): ${nomes}.` };
    }
    if (tipo === "cartoes") {
      const list = await listCartoes(ctx.workspaceId);
      const nomes =
        list.map((c) => `${c.apelido}${c.ultimos_digitos ? ` final ${c.ultimos_digitos}` : ""}`).join(", ") ||
        "nenhum";
      return { texto: `${list.length} cartão(ões): ${nomes}.` };
    }
    if (tipo === "categorias") {
      const list = await listCategorias(ctx.workspaceId);
      const nomes = list.map((c) => c.nome).join(", ") || "nenhuma";
      return { texto: `${list.length} categoria(s): ${nomes}.` };
    }
    if (tipo === "compromissos") {
      const list = (await listColecoes(ctx.workspaceId)).filter((c) => c.tipo === "compromisso");
      const linhas =
        list.map((c) => `${c.nome} — ${c.status ?? "aberto"}${c.valor ? ` (${formatBRL(c.valor)})` : ""}`).join("; ") ||
        "nenhum";
      return { texto: `${list.length} compromisso(s): ${linhas}.` };
    }
    if (tipo === "metas") {
      const list = await listMetas(ctx.workspaceId);
      const linhas =
        list
          .map(
            (m) =>
              `${m.nome}: ${formatBRL(m.valorAtual)} de ${formatBRL(m.valorAlvo)}${m.dataAlvo ? ` (até ${m.dataAlvo})` : ""}`,
          )
          .join("; ") || "nenhuma";
      return { texto: `${list.length} meta(s): ${linhas}.` };
    }
    const orc = await listOrcamentos(ctx.workspaceId);
    const linhas =
      orc
        .map(
          (o) =>
            `${o.categoriaNome}: ${formatBRL(o.gasto)} de ${formatBRL(o.planejado)} (${Math.round((o.gasto / Math.max(1, o.planejado)) * 100)}%)`,
        )
        .join("; ") || "nenhum";
    return { texto: `${orc.length} orçamento(s) este mês: ${linhas}.` };
  },
};

const listarTransacoes: NiaTool = {
  nome: "listar_transacoes",
  descricao:
    "Lista as transações recentes da família (opcionalmente filtrando por um termo na descrição). Use quando o usuário quiser ver lançamentos, conferir um gasto específico ou revisar o histórico.",
  nivel: "auto",
  inputSchema: {
    type: "object",
    properties: {
      busca: { type: "string", description: "Filtra pela descrição (opcional)." },
      limite: { type: "number", description: "Quantas trazer (1–30, default 10)." },
    },
  },
  async executar(args, ctx) {
    const d = valida(listarTransacoesArgs, args);
    const list = await listTransacoes(ctx.workspaceId, { busca: d.busca, limit: d.limite });
    if (list.length === 0) return { texto: "Nenhuma transação encontrada." };
    const linhas = list.map(
      (t) =>
        `${formatDate(t.data_transacao)} · ${t.descricao} · ${formatBRL(t.valor)}${
          t.categoria ? ` · ${t.categoria.nome}` : ""
        }`,
    );
    return { texto: `Transações:\n${linhas.join("\n")}` };
  },
};

const lancarTransacao: NiaTool = {
  nome: "lancar_transacao",
  descricao:
    "Propõe o lançamento de uma despesa ou receita. NÃO grava direto: gera um cartão de confirmação para o usuário aprovar. Use quando o usuário relatar um gasto ou recebimento.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["despesa", "receita", "transferencia", "investimento_aporte", "investimento_resgate"],
        description: "Tipo da transação. Default: despesa.",
      },
      descricao: { type: "string", description: "Descrição curta (ex.: 'mercado')." },
      valor: { type: "number", description: "Valor positivo em reais." },
      data_transacao: { type: "string", description: "Data ISO (YYYY-MM-DD). Default: hoje." },
      categoria: { type: "string", description: "Nome da categoria, se o usuário indicar." },
      estabelecimento: { type: "string", description: "Nome do estabelecimento, se houver." },
      meio_pagamento: {
        type: "string",
        enum: [
          "cartao_credito",
          "cartao_debito",
          "pix",
          "dinheiro",
          "transferencia",
          "boleto",
          "vr",
          "va",
          "cartao_escola",
          "outro",
        ],
      },
    },
    required: ["descricao", "valor"],
  },
  async executar(args, ctx) {
    const d = valida(lancarTransacaoArgs, args);
    const data = d.data_transacao ?? new Date().toISOString().slice(0, 10);

    // Zona cinza de estabelecimento (0.60–0.94 e não-exato) → pergunta inline no chat.
    let match: { candidatoId: string; sugestao: string; score: number } | null = null;
    if (d.estabelecimento) {
      const top = await buscarMatchEstabelecimento(ctx.workspaceId, d.estabelecimento);
      if (top && normalizarTexto(top.nome) !== normalizarTexto(d.estabelecimento) && top.score >= 0.6 && top.score < 0.95) {
        match = { candidatoId: top.id, sugestao: top.nome, score: top.score };
      }
    }

    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "lancar_transacao",
      nivel: "confirmar",
      payloadProposto: { ...d, data_transacao: data, _match: match },
    });
    if (!acaoId) throw new Error("Não consegui preparar o lançamento.");
    const widget: NiaWidget = {
      tipo: "confirmar_transacao",
      acaoId,
      nivel: "confirmar",
      descricao: d.descricao,
      valor: d.valor,
      tipoTransacao: d.tipo,
      categoria: d.categoria ?? null,
      estabelecimento: d.estabelecimento ?? null,
      data,
      match: match ? { sugestao: match.sugestao, score: match.score } : null,
    };
    const texto = `Preparei um lançamento de ${formatBRL(d.valor)} (${d.descricao}) para o usuário confirmar.`;
    return { texto, widget };
  },
};

const criarPessoa: NiaTool = {
  nome: "criar_pessoa",
  descricao:
    "Propõe cadastrar uma nova pessoa ou grupo da família (entidade). NÃO grava direto: gera um cartão de confirmação. Use quando o usuário citar alguém ainda não cadastrado.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome da pessoa ou grupo." },
      tipo: { type: "string", enum: ["pessoa", "grupo"], description: "Default: pessoa." },
    },
    required: ["nome"],
  },
  async executar(args, ctx) {
    const d = valida(criarPessoaArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_pessoa",
      nivel: "confirmar_estrutural",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar o cadastro.");
    const widget: NiaWidget = { tipo: "criar_pessoa", acaoId, nome: d.nome, tipoEntidade: d.tipo };
    return { texto: `Preparei o cadastro de ${d.nome} para o usuário confirmar.`, widget };
  },
};

const criarCompromisso: NiaTool = {
  nome: "criar_compromisso",
  descricao:
    "Propõe criar um compromisso (compra coletiva/encomenda) que pode demorar a chegar e depende de outras pessoas para fechar. Use para pedidos em grupo. Registra valor estimado e entrega prevista; status inicial 'aberto'.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome do pedido/compromisso." },
      valor_estimado: { type: "number", description: "Valor estimado em reais." },
      data_estimada_entrega: { type: "string", description: "Data ISO (YYYY-MM-DD) estimada." },
    },
    required: ["nome"],
  },
  async executar(args, ctx) {
    const d = valida(criarCompromissoArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_compromisso",
      nivel: "confirmar",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar o compromisso.");
    const widget: NiaWidget = {
      tipo: "criar_compromisso",
      acaoId,
      nome: d.nome,
      valorEstimado: d.valor_estimado ?? null,
      dataEstimada: d.data_estimada_entrega ?? null,
    };
    return { texto: `Preparei o compromisso "${d.nome}" para o usuário confirmar.`, widget };
  },
};

const lembrarFato: NiaTool = {
  nome: "lembrar_fato",
  descricao:
    "Propõe guardar um fato durável sobre a rotina/preferências da família na memória da Nia (ex.: 'a Bruna compra roupas em grupos de compra coletiva'). NÃO use para transações pontuais. Gera um cartão de confirmação.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      fato: { type: "string", description: "O fato a lembrar, curto e específico." },
    },
    required: ["fato"],
  },
  async executar(args, ctx) {
    const d = valida(lembrarFatoArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "lembrar_fato",
      nivel: "confirmar",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar a memória.");
    const widget: NiaWidget = { tipo: "lembrar_fato", acaoId, fato: d.fato };
    return { texto: `Quer que eu lembre: "${d.fato}"?`, widget };
  },
};

const criarCategoria: NiaTool = {
  nome: "criar_categoria",
  descricao:
    "Propõe cadastrar uma nova categoria de gastos/receitas. Comportamento: 'basico' (padrão), 'projeto' (viagem/reforma) ou 'compromisso' (compra coletiva). Gera cartão de confirmação.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string" },
      comportamento: { type: "string", enum: ["basico", "projeto", "compromisso"] },
      icone: { type: "string", description: "Emoji opcional." },
    },
    required: ["nome"],
  },
  async executar(args, ctx) {
    const d = valida(criarCategoriaArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_categoria",
      nivel: "confirmar_estrutural",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar a categoria.");
    const widget: NiaWidget = {
      tipo: "criar_categoria",
      acaoId,
      nome: d.nome,
      comportamento: d.comportamento,
    };
    return { texto: `Preparei a categoria "${d.nome}" para confirmar.`, widget };
  },
};

const criarConta: NiaTool = {
  nome: "criar_conta",
  descricao:
    "Propõe cadastrar uma conta bancária. Precisa do titular (nome de uma pessoa já cadastrada). Gera cartão de confirmação.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      apelido: { type: "string", description: "Apelido da conta (ex.: 'Itaú Bruna')." },
      banco: { type: "string" },
      tipo: {
        type: "string",
        enum: ["corrente", "poupanca", "salario", "pagamento", "investimento"],
      },
      titular: { type: "string", description: "Nome do titular (pessoa cadastrada)." },
    },
    required: ["apelido", "banco", "titular"],
  },
  async executar(args, ctx) {
    const d = valida(criarContaArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_conta",
      nivel: "confirmar_estrutural",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar a conta.");
    const widget: NiaWidget = {
      tipo: "criar_conta",
      acaoId,
      apelido: d.apelido,
      banco: d.banco,
      titular: d.titular,
    };
    return { texto: `Preparei a conta "${d.apelido}" para confirmar.`, widget };
  },
};

const criarCartao: NiaTool = {
  nome: "criar_cartao",
  descricao:
    "Propõe cadastrar um cartão. Precisa do titular (nome de uma pessoa já cadastrada). Gera cartão de confirmação.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      apelido: { type: "string", description: "Apelido do cartão (ex.: 'Nubank Nicolas')." },
      banco: { type: "string" },
      titular: { type: "string", description: "Nome do titular (pessoa cadastrada)." },
      ultimos_digitos: { type: "string", description: "4 dígitos finais (opcional)." },
    },
    required: ["apelido", "banco", "titular"],
  },
  async executar(args, ctx) {
    const d = valida(criarCartaoArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_cartao",
      nivel: "confirmar_estrutural",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar o cartão.");
    const widget: NiaWidget = {
      tipo: "criar_cartao",
      acaoId,
      apelido: d.apelido,
      banco: d.banco,
      titular: d.titular,
      ultimosDigitos: d.ultimos_digitos ?? null,
    };
    return { texto: `Preparei o cartão "${d.apelido}" para confirmar.`, widget };
  },
};

const criarMeta: NiaTool = {
  nome: "criar_meta",
  descricao:
    "Propõe criar uma meta financeira da família (ex.: 'juntar R$ 5.000 para a viagem'). Gera cartão de confirmação.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string" },
      valor_alvo: { type: "number", description: "Quanto se quer juntar." },
      data_alvo: { type: "string", description: "Data ISO (YYYY-MM-DD) opcional." },
    },
    required: ["nome", "valor_alvo"],
  },
  async executar(args, ctx) {
    const d = valida(criarMetaArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_meta",
      nivel: "confirmar_estrutural",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar a meta.");
    const widget: NiaWidget = {
      tipo: "criar_meta",
      acaoId,
      nome: d.nome,
      valorAlvo: d.valor_alvo,
      dataAlvo: d.data_alvo ?? null,
    };
    return { texto: `Preparei a meta "${d.nome}" para o usuário confirmar.`, widget };
  },
};

const criarOrcamento: NiaTool = {
  nome: "criar_orcamento",
  descricao:
    "Propõe definir ou atualizar o orçamento mensal de uma categoria (ex.: 'limite de R$ 800 no Mercado'). A categoria precisa existir. Gera cartão de confirmação.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      categoria: { type: "string", description: "Nome da categoria." },
      valor_planejado: { type: "number", description: "Limite mensal em reais." },
    },
    required: ["categoria", "valor_planejado"],
  },
  async executar(args, ctx) {
    const d = valida(criarOrcamentoArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_orcamento",
      nivel: "confirmar_estrutural",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar o orçamento.");
    const widget: NiaWidget = {
      tipo: "criar_orcamento",
      acaoId,
      categoria: d.categoria,
      valorPlanejado: d.valor_planejado,
    };
    return { texto: `Preparei o orçamento de "${d.categoria}" para o usuário confirmar.`, widget };
  },
};

const guardarDocumento: NiaTool = {
  nome: "guardar_documento",
  descricao:
    "Mantém no histórico uma IMAGEM ou PDF anexado que é um documento financeiro (nota fiscal, recibo, fatura, comprovante, boleto, extrato). Por padrão imagens e PDFs NÃO são guardados — chame isto só quando o anexo for um documento financeiro útil. NUNCA chame para foto de pessoa, documento pessoal ou arquivo irrelevante. (O áudio é mantido pela transcrição.)",
  nivel: "auto",
  inputSchema: {
    type: "object",
    properties: { motivo: { type: "string", description: "Que documento é (ex.: 'nota do mercado')." } },
  },
  async executar(_args, ctx) {
    const docs = ctx.docsTurno ?? [];
    if (ctx.reter) for (const d of docs) ctx.reter.push(d.midiaId);
    return { texto: docs.length > 0 ? "Documento mantido no histórico." : "Não há anexo para guardar." };
  },
};

export const NIA_TOOLS: NiaTool[] = [
  consultarGastos,
  consultarCadastros,
  listarTransacoes,
  lancarTransacao,
  criarPessoa,
  criarCategoria,
  criarConta,
  criarCartao,
  criarCompromisso,
  criarMeta,
  criarOrcamento,
  lembrarFato,
  guardarDocumento,
];

export function getTool(nome: string): NiaTool | undefined {
  return NIA_TOOLS.find((t) => t.nome === nome);
}
