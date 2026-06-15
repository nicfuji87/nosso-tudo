import "server-only";
import type { z } from "zod";
import { getGastosPorCategoria, getResumoMes } from "@/lib/db/queries";
import { formatBRL } from "@/lib/format";
import {
  consultarGastosArgs,
  criarCompromissoArgs,
  criarPessoaArgs,
  lancarTransacaoArgs,
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

export const NIA_TOOLS: NiaTool[] = [
  consultarGastos,
  lancarTransacao,
  criarPessoa,
  criarCompromisso,
];

export function getTool(nome: string): NiaTool | undefined {
  return NIA_TOOLS.find((t) => t.nome === nome);
}
