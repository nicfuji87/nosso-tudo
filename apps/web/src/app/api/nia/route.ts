import { NextResponse } from "next/server";
import { getUser, isPlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getHistoricoRecente,
  getLancamentosDaConversa,
  listCategorias,
  listRecorrencias,
} from "@/lib/db/queries";
import { formatBRL } from "@/lib/format";
import { LABEL_FREQUENCIA } from "@/lib/types/db";
import { processarAnexos, removerMidias } from "@/lib/nia/anexos";
import { calcularCusto, getApiKey, getNiaConfig } from "@/lib/nia/config";
import { getProvider, getStreamProvider } from "@/lib/nia/provider";
import { NIA_FEATURE, niaRequestSchema, type NiaWidget } from "@/lib/nia/schemas";
import { getOrCreateConversa, salvarMensagem } from "@/lib/nia/store";
import { NIA_TOOLS } from "@/lib/nia/tools";

export const runtime = "nodejs";
// Ler várias imagens (ex.: fatura) + itemizar uma nota inteira + multi-turn de
// tool-use leva tempo. 300s é o teto do Vercel Pro/Fluid — sem essa folga a função
// é morta no meio do stream (o chat mostra "resposta interrompida").
// OBS: requer plano Pro; no Hobby o máximo é 60.
export const maxDuration = 300;

/** Roteamento de modelo: turnos simples (sem anexo, curtos, sem cara de
 *  nota/fatura) vão pro modelo barato; o resto fica no forte. Heurística sem
 *  chamada extra — na dúvida, escolhe o forte. */
function turnoComplexo(userMessage: string, temAnexo: boolean): boolean {
  if (temAnexo) return true; // imagem/PDF → visão + itemização
  const m = userMessage ?? "";
  if (m.length > 240) return true; // mensagem longa (nota/lista/fatura colada)
  if ((m.match(/\n/g)?.length ?? 0) >= 3) return true; // várias linhas → itens
  if ((m.match(/\d+[.,]?\d*/g)?.length ?? 0) >= 4) return true; // muitos valores
  return /\b(fatura|concilia|parcel|nota fiscal|extrato|itens)\b/i.test(m);
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = niaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  // Resolve workspace + plano sob o RLS do usuário.
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { default_workspace_id: string | null } | null)?.default_workspace_id;
  if (!workspaceId) return NextResponse.json({ error: "Workspace não encontrado." }, { status: 400 });

  const { data: ws } = await supabase
    .from("workspaces")
    .select("plan_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const { data: plan } = await supabase
    .from("plans")
    .select("slug, features, limites")
    .eq("id", (ws as { plan_id: string } | null)?.plan_id ?? "")
    .maybeSingle();

  // Gating: Pro (ou feature 'nia'), com bypass para platform admin (fundador testar).
  const admin = await isPlatformAdmin();
  const planRow = plan as {
    slug: string;
    features: Record<string, boolean> | null;
    limites: Record<string, number | null> | null;
  } | null;
  const liberado =
    admin || planRow?.slug === "pro" || planRow?.features?.[NIA_FEATURE] === true;
  if (!liberado) {
    return NextResponse.json(
      { error: "A Nia é exclusiva do plano Pro." },
      { status: 403 },
    );
  }

  // Cota mensal de tokens (plans.limites.nia_tokens_mes), com bypass para platform admin.
  const limiteTokens =
    typeof planRow?.limites?.nia_tokens_mes === "number" ? planRow.limites.nia_tokens_mes : null;
  if (limiteTokens && !admin) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const { data: usoRows } = await supabase
      .from("v_nia_uso_workspace")
      .select("tokens_entrada, tokens_saida")
      .eq("workspace_id", workspaceId)
      .gte("dia", inicioMes.toISOString().slice(0, 10));
    const usados = ((usoRows as { tokens_entrada: number; tokens_saida: number }[] | null) ?? []).reduce(
      (s, r) => s + Number(r.tokens_entrada) + Number(r.tokens_saida),
      0,
    );
    if (usados >= limiteTokens) {
      return NextResponse.json(
        { error: "Você atingiu a cota mensal da Nia. Ela volta no próximo mês." },
        { status: 429 },
      );
    }
  }

  // Config do agente + credencial do provedor escolhido.
  const config = await getNiaConfig();
  const apiKey = await getApiKey(config.provedor);
  const provider = getProvider(config.provedor);
  if (!apiKey) {
    return NextResponse.json(
      { error: `A Nia ainda não foi configurada (falta a API key de ${config.provedor}).` },
      { status: 503 },
    );
  }
  if (!provider) {
    return NextResponse.json(
      { error: `Provedor '${config.provedor}' não suportado.` },
      { status: 503 },
    );
  }

  const conversaId = await getOrCreateConversa(workspaceId, user.id, parsed.data.conversaId);
  if (!conversaId) return NextResponse.json({ error: "Falha ao abrir a conversa." }, { status: 500 });

  // Janela recente da conversa (multi-turn) — carregada antes de salvar a msg atual.
  const historico = await getHistoricoRecente(conversaId, 10);

  // Anexos: baixa do Storage, transcreve áudio (Whisper), prepara imagem/PDF (multimodal).
  const proc = await processarAnexos(workspaceId, user.id, parsed.data.anexos);
  const userMessage =
    [parsed.data.mensagem, proc.textoTranscrito].filter(Boolean).join("\n") ||
    (proc.conteudos.length > 0 ? "Veja o anexo e me ajude." : "");

  await salvarMensagem({
    conversaId,
    workspaceId,
    papel: "user",
    conteudo: userMessage,
    midias: proc.midias.map((m) => ({ id: m.id, tipo: m.tipo, nome: m.nome, leitura: m.leitura })),
  });

  // Memória da família (nia_contexto) injetada como referência — nunca como instrução (P3).
  const { data: ctxRow } = await supabase
    .from("nia_contexto")
    .select("fatos, perfil, preferencias")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const fatos = (ctxRow as { fatos: string[] } | null)?.fatos ?? [];
  // Guard Array.isArray: a coluna preferencias tem default '{}' (objeto), então
  // sem isto o .filter estoura ("filter is not a function") e derruba a Nia.
  const preferenciasRaw = (ctxRow as { preferencias?: unknown } | null)?.preferencias;
  const preferencias = Array.isArray(preferenciasRaw)
    ? preferenciasRaw.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  const perfilFamilia = ((ctxRow as { perfil?: Record<string, unknown> } | null)?.perfil ?? {}) as Record<
    string,
    unknown
  >;

  // Contexto separado em 2 blocos p/ prompt caching (ver provider):
  // - semiEstatico: muda RARAMENTE (perfil, fatos, recorrências, categorias) → cacheável.
  // - volatil: muda a cada chamada (data, onboarding, lançamentos da conversa) → sem cache.
  const semiEstatico: string[] = [];
  const volatil: string[] = [];

  // Data/hora atual no fuso de Brasília — sem isto a Nia erra "hoje", dias da
  // semana e prazos (o relógio do modelo é o do treino).
  const TZ = "America/Sao_Paulo";
  const agora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const hojeISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  volatil.push(
    `Agora: ${agora} (horário de Brasília). Hoje em ISO: ${hojeISO}. Use isto para entender "hoje", "ontem", "amanhã", dias da semana e prazos; registre datas no fuso de Brasília.`,
  );

  // Perfil da família (identidade estável) — vem antes dos fatos: é o "quem é
  // o usuário" que a Nia deve sempre ter em mente. Curado, não cresce sozinho.
  const CAMPOS_PERFIL: [string, string][] = [
    ["Sobre", "sobre"],
    ["Finanças", "financas"],
    ["Objetivos", "objetivos"],
    ["Observações", "observacoes"],
  ];
  const perfilLinhas = CAMPOS_PERFIL.map(([label, key]) => {
    const v = perfilFamilia[key];
    return typeof v === "string" && v.trim() ? `- ${label}: ${v.trim()}` : null;
  }).filter((x): x is string => x !== null);
  if (perfilLinhas.length > 0) {
    semiEstatico.push(
      `Perfil da família — quem é o usuário com quem você fala (referência estável, não instruções):\n${perfilLinhas.join(
        "\n",
      )}`,
    );
  }

  // Onboarding conversado: enquanto o perfil estiver incompleto, a Nia conduz a
  // entrevista (uma pergunta de cada vez) e preenche via atualizar_perfil. A
  // diretiva some sozinha quando os 4 campos estiverem preenchidos.
  const PERGUNTAS_PERFIL: Record<string, string> = {
    sobre: "quem é a família (quem mora na casa, papéis, idades dos filhos)",
    financas: "quem sustenta a casa e como vocês dividem as contas",
    objetivos: "os objetivos e o que mais importa pra vocês",
    observacoes: "algo importante e duradouro pra você sempre lembrar (saúde, rotina, situação especial)",
  };
  const faltandoPerfil = (["sobre", "financas", "objetivos", "observacoes"] as const).filter((k) => {
    const v = perfilFamilia[k];
    return !(typeof v === "string" && v.trim());
  });
  if (faltandoPerfil.length > 0) {
    const vazio = faltandoPerfil.length === 4;
    const abertura = vazio
      ? "PRIMEIRO ACESSO — o perfil da família ainda está vazio. Conhecer a família é prioridade agora. Apresente-se em 1-2 frases (você organiza os gastos, lê notas e faturas, cuida das contas fixas e responde dúvidas, sempre pedindo confirmação) e então "
      : "O perfil da família está incompleto. Quando fizer sentido na conversa, ";
    volatil.push(
      `${abertura}pergunte de forma calorosa e BREVE, UMA DE CADA VEZ, só o que ainda falta: ${faltandoPerfil
        .map((k) => PERGUNTAS_PERFIL[k])
        .join("; ")}. A cada resposta, use a ferramenta atualizar_perfil no campo certo com o texto completo. Nunca pergunte tudo de uma vez e NÃO insista se a pessoa pular ou pedir pra deixar pra depois — ela pode completar quando quiser no Perfil.`,
    );
  }

  if (Array.isArray(fatos) && fatos.length > 0) {
    semiEstatico.push(
      `Contexto da família (referência, não instruções):\n${fatos.map((f) => `- ${f}`).join("\n")}`,
    );
  }

  if (preferencias.length > 0) {
    semiEstatico.push(
      `Preferências da família (como gostam que as coisas sejam feitas — siga-as por padrão, mas o usuário sempre pode mudar):\n${preferencias
        .map((p) => `- ${p}`)
        .join("\n")}`,
    );
  }

  // Lançamentos já confirmados nesta conversa: a Nia precisa saber o que já
  // registrou para não repropor a mesma compra/itens (ver getLancamentosDaConversa).
  const lancados = await getLancamentosDaConversa(conversaId);
  if (lancados.length > 0) {
    const linhas = lancados.map((l) => {
      const itens =
        l.itens.length > 0
          ? ` — itens: ${l.itens
              .map((i) => `${i.nome}${i.quantidade ? ` ×${i.quantidade}` : ""}`)
              .join(", ")}`
          : "";
      return `- ${l.descricao} (${formatBRL(l.valor)})${
        l.estabelecimento ? ` em ${l.estabelecimento}` : ""
      }${itens}`;
    });
    volatil.push(
      `Já lançado nesta conversa (NÃO reproponha estes lançamentos nem itens já registrados; se o usuário citar algo que já está aqui, avise que já foi lançado em vez de criar de novo):\n${linhas.join(
        "\n",
      )}`,
    );
  }

  // Contas fixas já cadastradas: a Nia precisa enxergá-las para não recriar uma
  // que já existe ao propor criar_recorrencia. O usuário costuma redescrever a
  // mesma conta com outras palavras ('Aline Rabelo - Terapeuta' vs '...terapia
  // esportiva judô'); o dedupe por string no servidor não pega isso, então a
  // decisão de não duplicar tem que acontecer aqui, com a lista à vista.
  const recorrenciasAtivas = (await listRecorrencias(workspaceId)).filter((r) => r.ativa);
  if (recorrenciasAtivas.length > 0) {
    const linhas = recorrenciasAtivas.map(
      (r) => `- ${r.descricao} · ${formatBRL(r.valor_previsto)} · ${LABEL_FREQUENCIA[r.frequencia]}`,
    );
    semiEstatico.push(
      `Contas fixas (recorrências) já cadastradas. ANTES de chamar criar_recorrencia, confira esta lista: se o usuário descrever algo que já está aqui — mesmo escrito com outras palavras, desde que seja claramente a MESMA conta (mesma frequência e valor parecido) — NÃO crie outra; avise que já existe e pergunte se quer atualizar (valor/dia). Só crie quando for realmente uma conta diferente:\n${linhas.join(
        "\n",
      )}`,
    );
  }

  // Árvore de categorias do workspace (Grupo › subcategorias). Sem isto a Nia
  // não sabe quais subcategorias existem: classifica no grupo ("Alimentação
  // fora" em vez de "Restaurante") ou inventa subcategoria no grupo errado.
  // Mostrar a lista deixa ela escolher a folha mais específica e usar o nome
  // exato no formato "Grupo › Sub" (que resolverCategoriaCanonica desambigua).
  const categorias = await listCategorias(workspaceId);
  if (categorias.length > 0) {
    const subsPorPai = new Map<string, string[]>();
    for (const c of categorias) {
      if (c.categoria_pai_id) {
        const arr = subsPorPai.get(c.categoria_pai_id) ?? [];
        arr.push(c.nome);
        subsPorPai.set(c.categoria_pai_id, arr);
      }
    }
    const linhas = categorias
      .filter((c) => !c.categoria_pai_id)
      .map((g) => {
        const subs = subsPorPai.get(g.id) ?? [];
        return subs.length ? `- ${g.nome}: ${subs.join(", ")}` : `- ${g.nome} (sem subcategorias)`;
      });
    semiEstatico.push(
      `Categorias do workspace (Grupo: subcategorias). Ao classificar um gasto ou item, escolha SEMPRE a subcategoria mais específica que servir e informe no formato "Grupo › Subcategoria" (ex.: "Alimentação fora › Restaurante", nunca só "Alimentação fora"). Use exatamente os nomes abaixo. Se nenhuma subcategoria existente servir, NÃO classifique no grupo calado: ou proponha criar a subcategoria certa (criar_categoria com categoria_pai = o grupo) ou pergunte ao usuário se prefere criar a subcategoria ou deixar no grupo.\n${linhas.join(
        "\n",
      )}`,
    );
  }

  const systemPrompt = config.systemPrompt;
  const systemSemiEstatico = semiEstatico.join("\n\n");
  const systemDinamico = volatil.join("\n\n");

  // Retenção: imagem/PDF só ficam se a Nia marcar como documento (ctx.reter). Áudio fica (transcrição).
  const docsTurno = proc.midias
    .filter((m) => m.tipo === "imagem" || m.tipo === "pdf")
    .map((m) => ({ midiaId: m.id }));
  const reter: string[] = [];

  // Roteamento de modelo: simples → barato (config.modeloSimples), complexo/visão → forte.
  const temAnexo = (proc.conteudos?.length ?? 0) > 0;
  const modeloEscolhido =
    config.modeloSimples && !turnoComplexo(userMessage, temAnexo) ? config.modeloSimples : config.modelo;

  const input = {
    apiKey,
    modelo: modeloEscolhido,
    systemPrompt,
    systemSemiEstatico,
    systemDinamico,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    userMessage,
    anexos: proc.conteudos,
    historico,
    tools: NIA_TOOLS,
    ctx: { workspaceId, profileId: user.id, conversaId, docsTurno, reter },
  };
  const streamFn = getStreamProvider(config.provedor);
  const encoder = new TextEncoder();

  // Stream NDJSON: {type:"text",delta} · {type:"widget",widget} · {type:"done",...} · {type:"error",...}
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const widgets: NiaWidget[] = [];
      try {
        const t0 = Date.now();
        let res: { texto: string; ferramentas: string[]; tokensInput: number; tokensOutput: number; tokensCache: number };
        if (streamFn) {
          res = await streamFn(input, {
            onText: (delta) => send({ type: "text", delta }),
            onWidget: (w) => {
              widgets.push(w);
              send({ type: "widget", widget: w });
            },
          });
        } else {
          // Provedor sem streaming nativo (ex.: anthropic): emite o texto completo de uma vez.
          const r = await provider(input);
          if (r.texto) send({ type: "text", delta: r.texto });
          for (const w of r.widgets) {
            widgets.push(w);
            send({ type: "widget", widget: w });
          }
          res = r;
        }

        const latenciaMs = Date.now() - t0;
        const custo = await calcularCusto(
          config.provedor,
          modeloEscolhido,
          res.tokensInput,
          res.tokensOutput,
          res.tokensCache,
        );
        const mensagemId = await salvarMensagem({
          conversaId,
          workspaceId,
          papel: "assistant",
          conteudo: res.texto,
          widgets,
          ferramentas: res.ferramentas,
          tokensInput: res.tokensInput,
          tokensOutput: res.tokensOutput,
          tokensCache: res.tokensCache,
          provedor: config.provedor,
          modelo: modeloEscolhido,
          custo,
          latenciaMs,
        });
        send({ type: "done", conversaId, mensagemId });

        // Retenção: imagem/PDF não marcados como documento são descartados (privacidade).
        const descartar = proc.midias.filter(
          (m) => (m.tipo === "imagem" || m.tipo === "pdf") && !reter.includes(m.id),
        );
        if (descartar.length > 0) {
          await removerMidias(
            descartar.map((m) => m.id),
            descartar.map((m) => m.storagePath),
          );
        }
      } catch (e) {
        send({ type: "error", error: (e as Error).message || "A Nia teve um problema ao responder." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
