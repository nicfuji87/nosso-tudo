import "server-only";
import type { z } from "zod";
import {
  getGastosPorCategoria,
  getResumoMes,
  listCartoes,
  listCategorias,
  listColecoes,
  listContas,
  listEntidades,
  listTransacoes,
} from "@/lib/db/queries";
import { formatBRL, formatDate } from "@/lib/format";
import {
  consultarCadastrosArgs,
  consultarGastosArgs,
  criarCartaoArgs,
  criarCategoriaArgs,
  criarCompromissoArgs,
  criarContaArgs,
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
        enum: ["pessoas", "contas", "cartoes", "categorias", "compromissos"],
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
    const list = (await listColecoes(ctx.workspaceId)).filter((c) => c.tipo === "compromisso");
    const linhas =
      list.map((c) => `${c.nome} — ${c.status ?? "aberto"}${c.valor ? ` (${formatBRL(c.valor)})` : ""}`).join("; ") ||
      "nenhum";
    return { texto: `${list.length} compromisso(s): ${linhas}.` };
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
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "lancar_transacao",
      nivel: "confirmar",
      payloadProposto: { ...d, data_transacao: data },
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
  lembrarFato,
];

export function getTool(nome: string): NiaTool | undefined {
  return NIA_TOOLS.find((t) => t.nome === nome);
}
