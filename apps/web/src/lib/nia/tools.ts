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
  listarEventos,
} from "@/lib/db/queries";
import { formatBRL, formatDate } from "@/lib/format";
import { FREQUENCIAS_RECORRENCIA, LABEL_ESSENCIALIDADE, LABEL_FREQUENCIA } from "@/lib/types/db";
import { normalizarTexto } from "@/lib/normalize";
import {
  atualizarPerfilArgs,
  buscarDocumentosArgs,
  buscarItensArgs,
  CAMPOS_PERFIL,
  conciliarFaturaArgs,
  consultarItemArgs,
  LABEL_CAMPO_PERFIL,
  consultarCadastrosArgs,
  consultarGastosArgs,
  criarCartaoArgs,
  criarCategoriaArgs,
  criarCompromissoArgs,
  criarContaArgs,
  criarEventoArgs,
  marcarEventoArgs,
  criarMetaArgs,
  criarOrcamentoArgs,
  criarPessoaArgs,
  criarRecorrenciaArgs,
  enviarDocumentoArgs,
  lancarTransacaoArgs,
  lancarTransacaoDetalhadaArgs,
  lembrarFatoArgs,
  lembrarPreferenciaArgs,
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
    "Propõe o lançamento de uma despesa ou receita. NÃO grava direto: gera um cartão de confirmação para o usuário aprovar. Use quando o usuário relatar um gasto ou recebimento. Capture também o meio de pagamento e o cartão/conta quando o usuário mencionar (ex.: 'paguei no Latam Pass', 'saiu do Itaú'). E o BENEFICIÁRIO (quem se beneficiou), inferindo do contexto: 'Henrique cortou o cabelo' → beneficiario 'Henrique'; 'Bruna comprou roupas' → 'Bruna'; mercado/contas da casa → o grupo da família (ex.: 'Casa'). Independe de quem pagou. PARCELAMENTO: se a compra foi parcelada (ex.: 'em 3x', 'parcelei em 2'), preencha `parcelas` com o número de vezes — o `valor` é sempre o TOTAL da compra (se o usuário disser '2x de R$200', o total é R$400 e parcelas=2). O sistema gera um lançamento por mês automaticamente.",
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
      categoria: {
        type: "string",
        description:
          "Categoria no formato 'Grupo › Subcategoria', escolhendo a subcategoria mais específica que EXISTE na lista de categorias do contexto (ex.: 'Alimentação fora › Restaurante'). Não classifique só no grupo: se nenhuma subcategoria servir, proponha criar a certa (criar_categoria com categoria_pai) ou pergunte se pode deixar no grupo.",
      },
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
      parcelas: {
        type: "number",
        description:
          "Número de parcelas, se a compra foi parcelada (ex.: 'em 3x' → 3). 1 ou ausente = à vista. O `valor` continua sendo o TOTAL; o sistema divide em N lançamentos mensais.",
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
      parcelas: d.parcelas && d.parcelas > 1 ? d.parcelas : null,
      match: match ? { sugestao: match.sugestao, score: match.score } : null,
    };
    const texto = `Preparei um lançamento de ${formatBRL(d.valor)} (${d.descricao}${
      d.parcelas && d.parcelas > 1 ? `, em ${d.parcelas}x` : ""
    }) para o usuário confirmar.`;
    return { texto, widget };
  },
};

const lancarTransacaoDetalhada: NiaTool = {
  nome: "lancar_transacao_detalhada",
  descricao:
    "Lança uma compra com os ITENS individuais (de uma nota fiscal/recibo de UMA única compra). Use quando o usuário enviar a foto ou PDF de uma nota: leia cada item (nome, quantidade, valor) e proponha todos. NÃO use para FATURA/EXTRATO de cartão de crédito (várias compras do mês) — nesse caso use conciliar_fatura, que casa com o que já foi lançado em vez de duplicar. Capture também o meio de pagamento, o cartão/conta e o beneficiário quando aparecerem (ex.: 'Latam Pass' → cartao 'Latam Pass'). NÃO grava direto — gera um checklist para o usuário confirmar item a item.",
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
      cartao: { type: "string", description: "Apelido do cartão usado, se aparecer (ex.: 'Latam Pass')." },
      conta: { type: "string", description: "Apelido da conta usada, se aparecer." },
      beneficiario: {
        type: "string",
        description: "Quem se beneficiou da compra (pessoa/grupo), se der pra inferir. Ex.: 'Casa' para mercado.",
      },
      itens: {
        type: "array",
        description:
          "Itens da nota. Classifique CADA item na subcategoria mais específica, no formato 'Grupo › Subcategoria' (ex.: 'Alimentação em casa › Hortifruti', 'Casa › Limpeza', 'Alimentação fora › Restaurante'). Itens da mesma nota podem ter categorias diferentes (mercado mistura comida, limpeza, higiene...). Use os nomes da lista de categorias do contexto.",
        items: {
          type: "object",
          properties: {
            nome: { type: "string" },
            quantidade: { type: "number" },
            unidade: { type: "string" },
            valor_unitario: { type: "number" },
            valor_total: { type: "number" },
            categoria: {
              type: "string",
              description: "Categoria do item no formato 'Grupo › Subcategoria' (a subcategoria mais específica que existir).",
            },
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
      pagamento: d.cartao ?? d.conta ?? null,
      beneficiario: d.beneficiario ?? null,
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
    "Propõe cadastrar uma CONTA FIXA (despesa ou receita RECORRENTE): aluguel, mensalidade, assinatura, salário, diarista/passadeira que vem sempre, etc. Use quando o usuário descrever algo que se REPETE no tempo ('todo mês', 'toda terça', 'semana sim, semana não', 'todo dia 10', 'todo ano'). Mapeie a frequência: diaria, semanal, quinzenal (= semana sim/semana não, a cada 15 dias), mensal, bimestral, trimestral, semestral, anual. O sistema gera os lançamentos sozinho no vencimento — então NÃO use lancar_transacao para o mesmo gasto recorrente, nem lembrar_fato (a recorrência já é a memória). ANTES de usar, confira a lista 'Contas fixas (recorrências) já cadastradas' no contexto: se já existir uma equivalente (mesma frequência e valor parecido, mesmo que escrita com outras palavras), NÃO crie outra — avise que já existe e ofereça atualizar. Gera um cartão de confirmação.",
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
      retroativo: {
        type: "boolean",
        description:
          "Só marque true se o usuário pedir EXPLICITAMENTE para lançar também as ocorrências passadas (ex.: 'lança desde janeiro'). Por padrão (false) a conta fixa só vale daqui pra frente — não recria meses passados.",
      },
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

const atualizarPerfil: NiaTool = {
  nome: "atualizar_perfil",
  descricao:
    "Propõe atualizar o PERFIL FIXO da família — a identidade estável que você sempre recebe no contexto. Campos: 'sobre' (quem é a família: pessoas, papéis, idades), 'financas' (quem sustenta, como dividem), 'objetivos' (metas e valores) e 'observacoes' (contexto duradouro e importante, ex.: rotina/saúde de alguém). Use SOMENTE para fatos ESTRUTURAIS e duradouros sobre QUEM a família é — nunca para gastos ou fatos do dia a dia (esses são lembrar_fato). Em 'texto', escreva o conteúdo COMPLETO e já atualizado do campo: incorpore o que já existe no perfil (você o recebe no contexto) + a novidade, sem só anexar. Gera cartão de confirmação.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      campo: {
        type: "string",
        enum: [...CAMPOS_PERFIL],
        description: "Qual campo do perfil atualizar.",
      },
      texto: {
        type: "string",
        description: "Conteúdo completo e atualizado do campo (não só o acréscimo).",
      },
    },
    required: ["campo", "texto"],
  },
  async executar(args, ctx) {
    const d = valida(atualizarPerfilArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "atualizar_perfil",
      nivel: "confirmar_estrutural",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar a atualização do perfil.");
    const widget: NiaWidget = {
      tipo: "atualizar_perfil",
      acaoId,
      campo: d.campo,
      campoLabel: LABEL_CAMPO_PERFIL[d.campo],
      texto: d.texto,
    };
    return {
      texto: `Quer que eu atualize o perfil da família (${LABEL_CAMPO_PERFIL[d.campo]})?`,
      widget,
    };
  },
};

const lembrarPreferencia: NiaTool = {
  nome: "lembrar_preferencia",
  descricao:
    "Propõe guardar uma PREFERÊNCIA durável da família — uma regra de COMO as coisas devem ser feitas, que te deixa consistente (ex.: 'cartão padrão é o Latam Pass', 'não separar gorjeta em restaurante', 'chamar o Henrique de Rique', 'mercado padrão é o Pão de Açúcar'). Diferente de lembrar_fato (fato pontual) e de atualizar_perfil (identidade da família). Use quando o usuário expressar como prefere algo de forma duradoura. Gera cartão de confirmação.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      preferencia: { type: "string", description: "A preferência, curta e específica (regra de como fazer)." },
    },
    required: ["preferencia"],
  },
  async executar(args, ctx) {
    const d = valida(lembrarPreferenciaArgs, args);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "lembrar_preferencia",
      nivel: "confirmar",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar a preferência.");
    const widget: NiaWidget = { tipo: "lembrar_preferencia", acaoId, preferencia: d.preferencia };
    return { texto: `Quer que eu guarde a preferência: "${d.preferencia}"?`, widget };
  },
};

const criarCategoria: NiaTool = {
  nome: "criar_categoria",
  descricao:
    "Propõe cadastrar uma nova categoria de gastos/receitas. Comportamento: 'basico' (padrão), 'projeto' (viagem/reforma) ou 'compromisso' (compra coletiva). Para criar uma SUBCATEGORIA dentro de um grupo (ex.: o usuário pede 'Atividade física > Acessório'), use nome='Acessório' e categoria_pai='Atividade física' (o grupo-pai é criado automaticamente se não existir). Gera cartão de confirmação.",
  nivel: "confirmar_estrutural",
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string" },
      comportamento: { type: "string", enum: ["basico", "projeto", "compromisso"] },
      icone: { type: "string", description: "Emoji opcional." },
      categoria_pai: {
        type: "string",
        description:
          "Nome do grupo/categoria-pai quando for uma subcategoria (ex.: 'Atividade física'). Criado se não existir.",
      },
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
      pai: d.categoria_pai ?? null,
    };
    return { texto: `Preparei a categoria "${d.nome}" para confirmar.`, widget };
  },
};

const LABEL_TIPO_EVENTO: Record<string, string> = {
  viagem: "Viagem",
  passeio: "Passeio",
  festa: "Festa",
  reforma: "Reforma",
  trabalho: "Trabalho",
  compra_mes: "Compra do mês",
  outro: "Evento",
};

const consultarEventos: NiaTool = {
  nome: "consultar_eventos",
  descricao:
    "Lista os EVENTOS/CONTEXTOS já cadastrados (viagens, passeios, festas, reformas, compra do mês), inclusive os que ainda não têm gasto. SEMPRE consulte antes de propor criar_evento ou marcar_evento: se já existir um evento com o mesmo sentido, reaproveite-o (não crie outro igual). Use também para 'quais eventos eu tenho?'.",
  nivel: "auto",
  inputSchema: { type: "object", properties: {} },
  async executar(_args, ctx) {
    const eventos = await listarEventos(ctx.workspaceId);
    if (eventos.length === 0) return { texto: "Nenhum evento cadastrado ainda." };
    const linhas = eventos.map(
      (e) =>
        `${e.nome}${e.tipo ? ` (${LABEL_TIPO_EVENTO[e.tipo] ?? e.tipo})` : ""}${
          e.dataReferencia ? ` — ${formatDate(e.dataReferencia)}` : ""
        }`,
    );
    return { texto: `${eventos.length} evento(s):\n${linhas.join("\n")}` };
  },
};

const criarEvento: NiaTool = {
  nome: "criar_evento",
  descricao:
    "Propõe criar um EVENTO/CONTEXTO da vida da família (o 'por quê' de um conjunto de gastos): uma viagem, um passeio, uma festa, uma reforma, a compra do mês. NÃO é categoria — categoria é o 'o quê' (Transporte, Alimentação, Hospedagem). Use quando o usuário pedir 'cria um evento', 'cria a viagem da Argentina', 'quero agrupar os gastos do aniversário'. ANTES de criar, confira com consultar_eventos se já existe um evento equivalente — se existir, reaproveite (não duplique). Depois, os gastos da viagem continuam em suas categorias naturais (uber→Transporte, hotel→Hospedagem) e ficam ligados a este evento. Gera cartão de confirmação.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome do evento, ex.: 'Viagem Argentina'." },
      tipo: {
        type: "string",
        enum: ["viagem", "passeio", "festa", "reforma", "trabalho", "compra_mes", "outro"],
        description: "Tipo do evento (opcional).",
      },
      data_referencia: { type: "string", description: "Data ISO de referência (ex.: início da viagem). Opcional." },
      descricao: { type: "string", description: "Observação curta (opcional)." },
    },
    required: ["nome"],
  },
  async executar(args, ctx) {
    const d = valida(criarEventoArgs, args);

    // Dedupe: confere os eventos existentes para avisar (e não duplicar) — o
    // salvar já reaproveita por nome idêntico, aqui é só para o card informar.
    const existentes = await listarEventos(ctx.workspaceId);
    const alvo = normalizarTexto(d.nome);
    const jaExiste = existentes.some((e) => normalizarTexto(e.nome) === alvo);
    const similares = jaExiste
      ? []
      : existentes
          .filter((e) => {
            const n = normalizarTexto(e.nome);
            return n.includes(alvo) || alvo.includes(n);
          })
          .map((e) => e.nome)
          .slice(0, 3);

    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "criar_evento",
      nivel: "confirmar",
      payloadProposto: d,
    });
    if (!acaoId) throw new Error("Não consegui preparar o evento.");
    const widget: NiaWidget = {
      tipo: "criar_evento",
      acaoId,
      nome: d.nome,
      tipoLabel: d.tipo ? (LABEL_TIPO_EVENTO[d.tipo] ?? null) : null,
      dataReferencia: d.data_referencia ?? null,
      jaExiste,
      similares: similares.length ? similares : undefined,
    };
    const texto = jaExiste
      ? `O evento "${d.nome}" já existe — ao confirmar, vou usar o que você já tem.`
      : `Preparei o evento "${d.nome}" para o usuário confirmar.`;
    return { texto, widget };
  },
};

const marcarEvento: NiaTool = {
  nome: "marcar_evento",
  descricao:
    "Agrupa lançamentos JÁ EXISTENTES sob um evento/contexto, mantendo a categoria de cada um. Use quando o usuário quiser juntar os gastos de uma viagem/passeio que já foram lançados (ex.: 'marca tudo da viagem da Argentina, de 10 a 17 de maio'). Informe a janela de datas do evento (data_inicio/data_fim) e, opcionalmente, um termo de busca. Antes, confira com consultar_eventos se o evento já existe (reaproveita); cria só se não existir. NÃO muda a categoria dos gastos — só os liga ao evento. Gera um cartão com a LISTA dos lançamentos: o usuário marca/desmarca quais entram antes de confirmar.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      evento: { type: "string", description: "Nome do evento, ex.: 'Viagem Argentina'." },
      data_inicio: { type: "string", description: "Data ISO inicial da janela (ex.: 1º dia da viagem)." },
      data_fim: { type: "string", description: "Data ISO final da janela (ex.: último dia da viagem)." },
      busca: { type: "string", description: "Filtra por um termo na descrição (opcional)." },
    },
    required: ["evento", "data_inicio", "data_fim"],
  },
  async executar(args, ctx) {
    const d = valida(marcarEventoArgs, args);
    const supabase = createClient();
    let query = supabase
      .from("transacoes")
      .select("id, descricao, valor, data_transacao")
      .eq("workspace_id", ctx.workspaceId)
      .eq("tipo", "despesa")
      .gte("data_transacao", d.data_inicio)
      .lte("data_transacao", d.data_fim)
      .order("data_transacao", { ascending: true });
    if (d.busca) query = query.ilike("descricao", `%${d.busca}%`);
    const { data } = await query;
    const rows =
      (data as { id: string; descricao: string; valor: number; data_transacao: string }[] | null) ?? [];
    if (rows.length === 0) {
      return {
        texto: `Nenhum lançamento de despesa encontrado entre ${formatDate(d.data_inicio)} e ${formatDate(
          d.data_fim,
        )}${d.busca ? ` com "${d.busca}"` : ""}.`,
      };
    }
    const lancamentos = rows.map((r) => ({
      transacaoId: r.id,
      descricao: r.descricao,
      valor: Number(r.valor),
      data: r.data_transacao ?? null,
    }));
    const total = lancamentos.reduce((s, l) => s + l.valor, 0);
    const acaoId = await registrarAcao({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "marcar_evento",
      nivel: "confirmar",
      payloadProposto: { evento: d.evento, lancamentos },
    });
    if (!acaoId) throw new Error("Não consegui preparar a marcação do evento.");
    const widget: NiaWidget = {
      tipo: "marcar_evento",
      acaoId,
      evento: d.evento,
      total,
      lancamentos,
    };
    return {
      texto: `Separei ${lancamentos.length} lançamento(s) (${formatBRL(
        total,
      )}) para marcar como "${d.evento}". Confira a lista abaixo 👇`,
      widget,
    };
  },
};

/** Diferença em dias entre duas datas ISO (a − b). */
function diasEntreISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay!, am! - 1, ad!) - Date.UTC(by!, bm! - 1, bd!)) / 86_400_000);
}

/** Soma `n` dias a uma data ISO (YYYY-MM-DD). */
function addDiasISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

interface CandidatoTx {
  id: string;
  descricao: string;
  valor: number;
  data_transacao: string;
  cartao_id: string | null;
  status_conciliacao: string | null;
}

const conciliarFatura: NiaTool = {
  nome: "conciliar_fatura",
  descricao:
    "CONCILIA uma FATURA de cartão de crédito (o extrato mensal com várias compras) com o que JÁ foi lançado — em vez de relançar tudo e duplicar. Use SEMPRE que o usuário enviar uma fatura/extrato de cartão (não uma nota de UMA compra). Leia cada LINHA da fatura (data da compra, descrição, valor; e a parcela tipo '3/10' se houver) e passe todas em 'linhas'. Informe o 'cartao' (ex.: 'Santander'), e o 'vencimento'/'total' se aparecerem. NÃO inclua linhas de crédito/pagamento (valor negativo, 'pagamento de fatura anterior'). Classifique cada linha com uma categoria do padrão quando der pra inferir (Uber→Transporte, mercado→Alimentação, farmácia→Saúde). O sistema casa cada linha com os lançamentos existentes por valor+data e mostra: já lançado (vou só conferir), faltando (vou lançar) e o que está no app mas não na fatura. NÃO grava direto — gera um cartão de conciliação para o usuário confirmar.",
  nivel: "confirmar",
  inputSchema: {
    type: "object",
    properties: {
      cartao: { type: "string", description: "Apelido do cartão da fatura (ex.: 'Santander', 'Nubank')." },
      mes_referencia: { type: "string", description: "Mês de referência, ISO YYYY-MM-DD (1º dia do mês). Opcional." },
      vencimento: { type: "string", description: "Vencimento da fatura, ISO YYYY-MM-DD. Opcional." },
      total: { type: "number", description: "Total a pagar da fatura, em reais. Opcional." },
      linhas: {
        type: "array",
        description: "Linhas (lançamentos) da fatura. Ignore créditos/pagamentos (valor negativo).",
        items: {
          type: "object",
          properties: {
            data: { type: "string", description: "Data da compra, ISO YYYY-MM-DD." },
            descricao: { type: "string" },
            valor: { type: "number", description: "Valor da linha em reais (positivo)." },
            parcela: { type: "string", description: "Parcela, ex.: '3/10'. Opcional." },
            categoria: {
              type: "string",
              description:
                "Categoria inferida da descrição, no formato 'Grupo › Subcategoria' (ex.: Uber → 'Transporte › Aplicativo/táxi', farmácia → 'Saúde › Medicamentos'). Opcional.",
            },
          },
          required: ["descricao", "valor"],
        },
      },
    },
    required: ["linhas"],
  },
  async executar(args, ctx) {
    const d = valida(conciliarFaturaArgs, args);
    const supabase = createClient();
    const ws = ctx.workspaceId;

    // Resolve o cartão pelo apelido (exato normalizado → contém).
    let cartaoId: string | null = null;
    let cartaoApelido: string | null = d.cartao ?? null;
    if (d.cartao) {
      const { data } = await supabase
        .from("cartoes")
        .select("id, apelido")
        .eq("workspace_id", ws)
        .eq("ativo", true);
      const lista = ((data as { id: string; apelido: string }[] | null) ?? []);
      const alvo = normalizarTexto(d.cartao);
      const achado =
        lista.find((c) => normalizarTexto(c.apelido) === alvo) ??
        lista.find((c) => {
          const n = normalizarTexto(c.apelido);
          return n.includes(alvo) || alvo.includes(n);
        });
      if (achado) {
        cartaoId = achado.id;
        cartaoApelido = achado.apelido;
      }
    }

    // Só linhas de compra (ignora créditos/pagamentos da fatura).
    const linhas = d.linhas.filter((l) => l.valor > 0);
    const datas = linhas.map((l) => l.data).filter((x): x is string => !!x).sort();
    const hoje = new Date().toISOString().slice(0, 10);
    const lo = datas.length ? addDiasISO(datas[0]!, -7) : addDiasISO(hoje, -120);
    const hi = datas.length ? addDiasISO(datas[datas.length - 1]!, 7) : hoje;

    // Candidatos: despesas no período ainda não conciliadas.
    const { data: candData } = await supabase
      .from("transacoes")
      .select("id, descricao, valor, data_transacao, cartao_id, status_conciliacao")
      .eq("workspace_id", ws)
      .eq("tipo", "despesa")
      .gte("data_transacao", lo)
      .lte("data_transacao", hi);
    const cands = ((candData as CandidatoTx[] | null) ?? []).filter(
      (c) => c.status_conciliacao !== "conciliado",
    );

    // Matching: valor exato (±0,01) + data dentro de ±6 dias; prioriza o mesmo cartão e a data mais próxima.
    const usados = new Set<string>();
    const casados: ConciliadoLinha[] = [];
    const faltando: { data: string | null; descricao: string; valor: number; categoria: string | null }[] = [];
    for (const l of linhas) {
      let melhor: CandidatoTx | null = null;
      let melhorScore = Number.POSITIVE_INFINITY;
      for (const c of cands) {
        if (usados.has(c.id)) continue;
        if (Math.abs(Number(c.valor) - l.valor) > 0.01) continue;
        const dd = l.data ? Math.abs(diasEntreISO(c.data_transacao, l.data)) : 0;
        if (dd > 6) continue;
        const penalidadeCartao = cartaoId && c.cartao_id && c.cartao_id !== cartaoId ? 100 : 0;
        const score = dd + penalidadeCartao;
        if (score < melhorScore) {
          melhorScore = score;
          melhor = c;
        }
      }
      if (melhor) {
        usados.add(melhor.id);
        casados.push({
          data: l.data ?? null,
          descricao: l.descricao,
          valor: l.valor,
          transacaoId: melhor.id,
          transacaoDescricao: melhor.descricao,
        });
      } else {
        faltando.push({
          data: l.data ?? null,
          descricao: l.descricao,
          valor: l.valor,
          categoria: l.categoria ?? null,
        });
      }
    }

    // Sobrando: lançamentos do cartão resolvido, no período, que não casaram (informativo).
    const sobrando = cartaoId
      ? cands
          .filter((c) => !usados.has(c.id) && c.cartao_id === cartaoId)
          .map((c) => ({ data: c.data_transacao, descricao: c.descricao, valor: Number(c.valor) }))
      : [];

    const mesRef = d.mes_referencia ?? (datas.length ? `${datas[datas.length - 1]!.slice(0, 7)}-01` : null);

    const acaoId = await registrarAcao({
      workspaceId: ws,
      profileId: ctx.profileId,
      conversaId: ctx.conversaId,
      ferramenta: "conciliar_fatura",
      nivel: "confirmar",
      payloadProposto: {
        cartaoApelido,
        cartaoId,
        mesReferencia: mesRef,
        vencimento: d.vencimento ?? null,
        total: d.total ?? null,
        casados,
        faltando,
      },
    });
    if (!acaoId) throw new Error("Não consegui preparar a conciliação.");

    const widget: NiaWidget = {
      tipo: "conciliacao_fatura",
      acaoId,
      cartao: cartaoApelido,
      mesReferencia: mesRef,
      vencimento: d.vencimento ?? null,
      totalFatura: d.total ?? null,
      casados: casados.map((c) => ({
        data: c.data,
        descricao: c.descricao,
        valor: c.valor,
        transacaoDescricao: c.transacaoDescricao,
      })),
      faltando,
      sobrando,
    };
    return {
      texto: `Conciliei a fatura${cartaoApelido ? ` do ${cartaoApelido}` : ""}: ${casados.length} já lançado(s), ${faltando.length} faltando, ${sobrando.length} no app fora da fatura. Aguardando confirmação.`,
      widget,
    };
  },
};

interface ConciliadoLinha {
  data: string | null;
  descricao: string;
  valor: number;
  transacaoId: string;
  transacaoDescricao: string;
}

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

const consultarItem: NiaTool = {
  nome: "consultar_item",
  descricao:
    "Responde com PRECISÃO perguntas sobre um item/produto comprado, com os números calculados pelo banco — você NUNCA soma nem lembra datas de cabeça. Dá: quantas vezes foi comprado, total gasto (e num período), última e primeira compra (data, valor, local) e preço médio. Use para 'quando comprei X pela última vez?', 'quanto gastamos de X nos últimos 3 meses?', 'quantas vezes comprei X?', 'qual o preço do X?'. Passe 'termo' = o produto (ex.: 'sal', 'farinha de trigo', 'banana'). Para um período, passe 'inicio' e 'fim' em ISO (YYYY-MM-DD) calculados a partir de hoje (ex.: 'últimos 3 meses'); sem período, considera todo o histórico.",
  nivel: "auto",
  inputSchema: {
    type: "object",
    properties: {
      termo: { type: "string", description: "O produto/item (ex.: 'sal', 'farinha de trigo')." },
      inicio: { type: "string", description: "Início do período em ISO (YYYY-MM-DD). Opcional." },
      fim: { type: "string", description: "Fim do período em ISO (YYYY-MM-DD). Opcional." },
    },
    required: ["termo"],
  },
  async executar(args, ctx) {
    const d = valida(consultarItemArgs, args);
    const supabase = createClient();
    const { data } = await supabase.rpc("consultar_item", {
      p_workspace_id: ctx.workspaceId,
      p_termo: d.termo,
      p_inicio: d.inicio ?? null,
      p_fim: d.fim ?? null,
    });
    const row = (
      data as
        | {
            n_compras: number;
            total: number;
            qtd_total: number;
            ultima_data: string | null;
            ultimo_valor: number | null;
            ultimo_local: string | null;
            primeira_data: string | null;
            preco_medio: number | null;
          }[]
        | null
    )?.[0];
    const periodoTxt = d.inicio || d.fim ? " no período" : "";
    const n = row ? Number(row.n_compras) : 0;
    if (!row || n === 0) return { texto: `Não encontrei compras de "${d.termo}"${periodoTxt}.` };
    const partes = [
      `"${d.termo}": ${n} ${n === 1 ? "compra" : "compras"}${periodoTxt}, total ${formatBRL(Number(row.total))}.`,
    ];
    if (row.ultima_data) {
      partes.push(
        `Última compra: ${formatDate(row.ultima_data)}${
          row.ultimo_valor != null ? ` por ${formatBRL(Number(row.ultimo_valor))}` : ""
        }${row.ultimo_local ? ` em ${row.ultimo_local}` : ""}.`,
      );
    }
    if (row.preco_medio != null && n > 1) {
      partes.push(`Preço médio por compra: ${formatBRL(Number(row.preco_medio))}.`);
    }
    return { texto: partes.join(" ") };
  },
};

const buscarItensTool: NiaTool = {
  nome: "buscar_itens",
  descricao:
    "LISTA as ocorrências de um item comprado (cada linha de nota: nome, data, local, valor) — ex.: 'me mostra minhas compras de feijão'. Para CONTAR, SOMAR, ver a ÚLTIMA compra ou o total gasto num item, use consultar_item (preciso, calculado no banco), não esta.",
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
      (d) => `[id:${d.id}] ${d.nome ?? "documento"} (${formatDate(d.data)}): ${(d.resumo ?? "").slice(0, 200)}`,
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
  consultarEventos,
  listarTransacoes,
  lancarTransacao,
  lancarTransacaoDetalhada,
  conciliarFatura,
  criarPessoa,
  criarCategoria,
  criarEvento,
  marcarEvento,
  criarConta,
  criarCartao,
  criarCompromisso,
  criarRecorrencia,
  criarMeta,
  criarOrcamento,
  lembrarFato,
  atualizarPerfil,
  lembrarPreferencia,
  consultarItem,
  buscarItensTool,
  consultarDocumentos,
  enviarDocumento,
  guardarDocumento,
];

export function getTool(nome: string): NiaTool | undefined {
  return NIA_TOOLS.find((t) => t.nome === nome);
}
