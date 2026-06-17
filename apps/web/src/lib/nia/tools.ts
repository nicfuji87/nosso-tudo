import "server-only";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buscarDocumentos,
  buscarItens,
  buscarMatchEstabelecimento,
  getAlertas,
  getGastosPorCategoria,
  getGastosPorContexto,
  getGastosPorEssencialidade,
  getMidia,
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
import { FREQUENCIAS_RECORRENCIA, LABEL_ESSENCIALIDADE, LABEL_FREQUENCIA } from "@/lib/types/db";
import { normalizarTexto } from "@/lib/normalize";
import {
  buscarDocumentosArgs,
  buscarItensArgs,
  consultarCadastrosArgs,
  consultarGastosArgs,
  criarCartaoArgs,
  criarCategoriaArgs,
  criarCompromissoArgs,
  criarContaArgs,
  criarMetaArgs,
  criarOrcamentoArgs,
  criarPessoaArgs,
  criarRecorrenciaArgs,
  enviarDocumentoArgs,
  lancarTransacaoArgs,
  lancarTransacaoDetalhadaArgs,
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

const consultarAlertas: NiaTool = {
  nome: "consultar_alertas",
  descricao:
    "Verifica avisos financeiros do mês (saldo negativo, orçamento estourado ou perto, cartão perto do limite). Use quando o usuário perguntar se há algo pra se preocupar ou pedir um panorama.",
  nivel: "auto",
  inputSchema: { type: "object", properties: {} },
  async executar(_args, ctx) {
    const alertas = await getAlertas(ctx.workspaceId);
    if (alertas.length === 0) return { texto: "Nenhum alerta — as finanças estão sob controle." };
    return { texto: "Avisos:\n" + alertas.map((a) => `- ${a.texto}`).join("\n") };
  },
};

const lancarTransacao: NiaTool = {
  nome: "lancar_transacao",
  descricao:
    "Propõe o lançamento de uma despesa ou receita. NÃO grava direto: gera um cartão de confirmação para o usuário aprovar. Use quando o usuário relatar um gasto ou recebimento. Capture também o meio de pagamento e o cartão/conta quando o usuário mencionar (ex.: 'paguei no Latam Pass', 'saiu do Itaú'). E o BENEFICIÁRIO (quem se beneficiou), inferindo do contexto: 'Henrique cortou o cabelo' → beneficiario 'Henrique'; 'Bruna comprou roupas' → 'Bruna'; mercado/contas da casa → o grupo da família (ex.: 'Casa'). Independe de quem pagou.",
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
      contexto: {
        type: "string",
        description:
          "Contexto/evento do gasto (o porquê), ex.: 'Passeio em família', 'Compra do mês'. Opcional.",
      },
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
      cartao: {
        type: "string",
        description: "Apelido do cartão usado, se o usuário citar (ex.: 'Latam Pass', 'Nubank').",
      },
      conta: {
        type: "string",
        description: "Apelido da conta usada, se o usuário citar (ex.: 'Itaú Bruna').",
      },
      beneficiario: {
        type: "string",
        description:
          "Quem se beneficiou da compra (nome de pessoa/grupo já cadastrado). Ex.: corte de cabelo do Henrique → 'Henrique'; mercado da casa → 'Casa'. Independe de quem pagou.",
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
      meioPagamento: d.meio_pagamento ?? null,
      pagamento: d.cartao ?? d.conta ?? null,
      beneficiario: d.beneficiario ?? null,
      data,
      match: match ? { sugestao: match.sugestao, score: match.score } : null,
    };
    const texto = `Preparei um lançamento de ${formatBRL(d.valor)} (${d.descricao}) para o usuário confirmar.`;
    return { texto, widget };
  },
};

const lancarTransacaoDetalhada: NiaTool = {
  nome: "lancar_transacao_detalhada",
  descricao:
    "Lança uma compra com os ITENS individuais (de uma nota fiscal/recibo). Use quando o usuário enviar a foto ou PDF de uma nota: leia cada item (nome, quantidade, valor) e proponha todos. NÃO grava direto — gera um checklist para o usuário confirmar item a item.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      descricao: { type: "string", description: "Resumo da compra (ex.: 'Compra no Pão de Açúcar')." },
      estabelecimento: { type: "string" },
      categoria: { type: "string", description: "Categoria geral da nota (opcional)." },
      contexto: {
        type: "string",
        description: "Contexto/evento da compra (ex.: 'Passeio em família', 'Compra do mês'). Opcional.",
      },
      data_transacao: { type: "string", description: "Data ISO (YYYY-MM-DD)." },
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
      itens: {
        type: "array",
        description:
          "Itens da nota. Classifique CADA item: categoria pelo nome do padrão (ex.: 'Hortifruti', 'Limpeza', 'Restaurante'), essencialidade e tipo. Itens da mesma nota podem ter categorias diferentes (mercado mistura comida, limpeza, higiene...).",
        items: {
          type: "object",
          properties: {
            nome: { type: "string" },
            quantidade: { type: "number" },
            unidade: { type: "string" },
            valor_unitario: { type: "number" },
            valor_total: { type: "number" },
            categoria: { type: "string", description: "Categoria do item (nome do padrão)." },
            essencialidade: {
              type: "string",
              enum: ["essencial", "necessario", "superfluo", "investimento"],
            },
            tipo: { type: "string", description: "Tipo do item (ex.: 'Frutas', 'Bebida', 'Limpeza')." },
          },
          required: ["nome"],
        },
      },
    },
    required: ["descricao", "itens"],
  },
  async executar(args, ctx) {
    const d = valida(lancarTransacaoDetalhadaArgs, args);
    const data = d.data_transacao ?? new Date().toISOString().slice(0, 10);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "lancar_transacao_detalhada",
      nivel: "confirmar",
      payloadProposto: { ...d, data_transacao: data },
    });
    if (!acaoId) throw new Error("Não consegui preparar o lançamento detalhado.");
    const widget: NiaWidget = {
      tipo: "checklist_itens",
      acaoId,
      descricao: d.descricao,
      estabelecimento: d.estabelecimento ?? null,
      itens: d.itens.map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade ?? null,
        valorTotal:
          i.valor_total ?? (i.valor_unitario != null && i.quantidade != null ? i.valor_unitario * i.quantidade : null),
      })),
    };
    return { texto: `Li ${d.itens.length} itens da nota para o usuário conferir.`, widget };
  },
};

const criarRecorrencia: NiaTool = {
  nome: "criar_recorrencia",
  descricao:
    "Propõe cadastrar uma CONTA FIXA (despesa ou receita RECORRENTE): aluguel, mensalidade, assinatura, salário, diarista/passadeira que vem sempre, etc. Use quando o usuário descrever algo que se REPETE no tempo ('todo mês', 'toda terça', 'semana sim, semana não', 'todo dia 10', 'todo ano'). Mapeie a frequência: diaria, semanal, quinzenal (= semana sim/semana não, a cada 15 dias), mensal, bimestral, trimestral, semestral, anual. O sistema gera os lançamentos sozinho no vencimento — então NÃO use lancar_transacao para o mesmo gasto recorrente, nem lembrar_fato (a recorrência já é a memória). Gera um cartão de confirmação.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      descricao: { type: "string", description: "Nome da conta fixa (ex.: 'Passadeira - Dona Luisa')." },
      valor: { type: "number", description: "Valor de cada ocorrência, em reais." },
      frequencia: {
        type: "string",
        enum: [...FREQUENCIAS_RECORRENCIA],
        description: "Periodicidade. 'quinzenal' = a cada 15 dias (semana sim, semana não).",
      },
      tipo: { type: "string", enum: ["despesa", "receita"], description: "Default: despesa." },
      data_inicio: {
        type: "string",
        description: "Data ISO (YYYY-MM-DD) da 1ª ocorrência/vencimento. Se já pagou hoje, use hoje. Default: hoje.",
      },
      data_fim: { type: "string", description: "Data ISO final (opcional)." },
      categoria: { type: "string", description: "Nome da categoria (opcional)." },
    },
    required: ["descricao", "valor", "frequencia"],
  },
  async executar(args, ctx) {
    const d = valida(criarRecorrenciaArgs, args);
    const dataInicio = d.data_inicio ?? new Date().toISOString().slice(0, 10);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_recorrencia",
      nivel: "confirmar",
      payloadProposto: { ...d, data_inicio: dataInicio },
    });
    if (!acaoId) throw new Error("Não consegui preparar a conta fixa.");
    const widget: NiaWidget = {
      tipo: "criar_recorrencia",
      acaoId,
      descricao: d.descricao,
      valor: d.valor,
      frequenciaLabel: LABEL_FREQUENCIA[d.frequencia],
      tipoTransacao: d.tipo,
      categoria: d.categoria ?? null,
      dataInicio,
    };
    return {
      texto: `Preparei a conta fixa "${d.descricao}" (${LABEL_FREQUENCIA[d.frequencia]}, ${formatBRL(
        d.valor,
      )}) para o usuário confirmar.`,
      widget,
    };
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

const buscarItensTool: NiaTool = {
  nome: "buscar_itens",
  descricao:
    "Busca itens/produtos já comprados (linhas das notas) por nome — ex.: 'feijão'. Responde quando, onde e por quanto. Use para 'eu comprei X?', 'quando comprei Y?', 'comprei feijão no Pão de Açúcar?'.",
  nivel: "auto",
  inputSchema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] },
  async executar(args, ctx) {
    const { termo } = valida(buscarItensArgs, args);
    const itens = await buscarItens(ctx.workspaceId, termo);
    if (itens.length === 0) return { texto: `Não encontrei "${termo}" nas compras registradas.` };
    const linhas = itens.map(
      (i) =>
        `${i.nome}${i.data ? ` — ${formatDate(i.data)}` : ""}${i.estabelecimento ? ` no ${i.estabelecimento}` : ""}${
          i.valorTotal != null ? ` (${formatBRL(i.valorTotal)})` : ""
        }`,
    );
    return { texto: linhas.join("\n") };
  },
};

const consultarDocumentos: NiaTool = {
  nome: "consultar_documentos",
  descricao:
    "Busca notas/recibos guardados pela leitura de texto (ex.: 'nota do Pão de Açúcar', 'nota de 2 de fevereiro'). Retorna o conteúdo lido e o id do documento (use o id em enviar_documento). Use para 'o que tinha naquela nota'.",
  nivel: "auto",
  inputSchema: {
    type: "object",
    properties: { busca: { type: "string", description: "Termo: estabelecimento, item ou data." } },
  },
  async executar(args, ctx) {
    const { busca } = valida(buscarDocumentosArgs, args);
    const docs = await buscarDocumentos(ctx.workspaceId, busca);
    if (docs.length === 0) return { texto: "Não encontrei documentos com esse conteúdo." };
    const linhas = docs.map(
      (d) => `[id:${d.id}] ${d.nome ?? "documento"} (${formatDate(d.data)}): ${(d.resumo ?? "").slice(0, 400)}`,
    );
    return { texto: linhas.join("\n\n") };
  },
};

const enviarDocumento: NiaTool = {
  nome: "enviar_documento",
  descricao:
    "Envia ao usuário um documento guardado (nota/recibo), exibindo-o no chat. Use o id obtido em consultar_documentos. Confirme com o usuário antes ('quer que eu te mande?').",
  nivel: "auto",
  inputSchema: { type: "object", properties: { midia_id: { type: "string" } }, required: ["midia_id"] },
  async executar(args, ctx) {
    const { midia_id } = valida(enviarDocumentoArgs, args);
    const midia = await getMidia(ctx.workspaceId, midia_id);
    if (!midia) return { texto: "Documento não encontrado." };
    const supabase = createClient();
    const { data } = await supabase.storage.from(midia.bucket).createSignedUrl(midia.storagePath, 3600);
    if (!data?.signedUrl) return { texto: "Não consegui gerar o link do documento." };
    const widget: NiaWidget = {
      tipo: "documento",
      url: data.signedUrl,
      nome: midia.nome ?? "documento",
      ehImagem: midia.tipo === "imagem",
    };
    return { texto: "Aqui está o documento.", widget };
  },
};

const guardarDocumento: NiaTool = {
  nome: "guardar_documento",
  descricao:
    "Mantém no histórico uma IMAGEM ou PDF anexado que é um documento financeiro (nota fiscal, recibo, fatura, comprovante, boleto, extrato). Passe em 'resumo' a leitura do documento (estabelecimento, data, itens, total) para poder consultá-lo depois sem reler o arquivo. Por padrão imagens e PDFs NÃO são guardados — chame só para documentos financeiros úteis. NUNCA chame para foto de pessoa, documento pessoal ou arquivo irrelevante. (O áudio é mantido pela transcrição.)",
  nivel: "auto",
  inputSchema: {
    type: "object",
    properties: {
      resumo: { type: "string", description: "Leitura do documento: estabelecimento, data, itens e total." },
    },
  },
  async executar(args, ctx) {
    const resumo =
      typeof (args as { resumo?: unknown })?.resumo === "string"
        ? (args as { resumo: string }).resumo.slice(0, 4000)
        : null;
    const docs = ctx.docsTurno ?? [];
    if (ctx.reter) for (const d of docs) ctx.reter.push(d.midiaId);
    if (resumo && docs.length > 0) {
      const supabase = createClient();
      await supabase
        .from("midias")
        .update({ texto_extraido: resumo })
        .in(
          "id",
          docs.map((d) => d.midiaId),
        );
    }
    return { texto: docs.length > 0 ? "Documento mantido no histórico." : "Não há anexo para guardar." };
  },
};

const consultarEssencialidade: NiaTool = {
  nome: "consultar_essencialidade",
  descricao:
    "Mostra os gastos do mês por essencialidade: essencial, necessário, supérfluo e investimento. Use para 'quanto gastei em supérfluos?', 'quanto é essencial?', 'estou gastando muito com coisa supérflua?'.",
  nivel: "auto",
  inputSchema: { type: "object", properties: {} },
  async executar(_args, ctx) {
    const dados = await getGastosPorEssencialidade(ctx.workspaceId);
    if (dados.length === 0)
      return { texto: "Ainda não há gastos classificados por essencialidade neste mês." };
    const total = dados.reduce((s, d) => s + d.total, 0);
    const linhas = dados.map(
      (d) =>
        `${LABEL_ESSENCIALIDADE[d.essencialidade]}: ${formatBRL(d.total)} (${Math.round(
          (d.total / Math.max(1, total)) * 100,
        )}%)`,
    );
    return { texto: `Gastos por essencialidade neste mês:\n${linhas.join("\n")}` };
  },
};

const consultarContexto: NiaTool = {
  nome: "consultar_contexto",
  descricao:
    "Mostra o custo total por contexto/evento da vida da família (ex.: 'quanto custou o passeio?', 'quanto gastei na viagem?', 'qual o custo da compra do mês?'). Lista os eventos e seus totais.",
  nivel: "auto",
  inputSchema: { type: "object", properties: {} },
  async executar(_args, ctx) {
    const dados = await getGastosPorContexto(ctx.workspaceId);
    if (dados.length === 0)
      return { texto: "Ainda não há eventos/contextos com gastos registrados." };
    const linhas = dados.map(
      (d) =>
        `${d.nome}: ${formatBRL(d.total)} (${d.nTransacoes} ${
          d.nTransacoes === 1 ? "lançamento" : "lançamentos"
        })`,
    );
    return { texto: `Custo por evento:\n${linhas.join("\n")}` };
  },
};

export const NIA_TOOLS: NiaTool[] = [
  consultarGastos,
  consultarCadastros,
  consultarAlertas,
  consultarEssencialidade,
  consultarContexto,
  listarTransacoes,
  lancarTransacao,
  lancarTransacaoDetalhada,
  criarPessoa,
  criarCategoria,
  criarConta,
  criarCartao,
  criarCompromisso,
  criarRecorrencia,
  criarMeta,
  criarOrcamento,
  lembrarFato,
  buscarItensTool,
  consultarDocumentos,
  enviarDocumento,
  guardarDocumento,
];

export function getTool(nome: string): NiaTool | undefined {
  return NIA_TOOLS.find((t) => t.nome === nome);
}
