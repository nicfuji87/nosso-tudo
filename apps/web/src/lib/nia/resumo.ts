import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatDate, hojeISO } from "@/lib/format";
import { getConversaAberta } from "@/lib/db/queries";
import { getApiKey, getNiaConfig } from "@/lib/nia/config";
import { getProvider } from "@/lib/nia/provider";

/**
 * Rotação diária da conversa da Nia, com resumo rolante.
 *
 * A conversa passou a ser DO DIA. No primeiro turno de um dia novo, a conversa do
 * dia anterior é encerrada (`arquivada`) e ganha um resumo, que é injetado no
 * contexto da conversa seguinte. O resumo é ROLANTE: ele resume o resumo anterior
 * JUNTO com as mensagens do dia que fechou, então o contexto geral atravessa os
 * dias e só a versão mais recente fica guardada.
 *
 * Por que a conversa não podia continuar aberta para sempre: a que existia tinha
 * 6 semanas e 568 mensagens: 250 kB carregados a cada abertura de /app/nia, sem
 * dar memória nenhuma (a janela do modelo é de 10 mensagens de qualquer jeito).
 *
 * CUIDADO — resumo rolante é uma estrutura de deriva composta: todo dia ele passa
 * pelo modelo de novo, e nada nunca o corrige. Três travas seguram isso:
 *  1. TETO_RESUMO — sem teto ele cresce até virar um segundo system prompt.
 *  2. O prompt PROÍBE valor, número e afirmação de "foi lançado". Fato financeiro
 *     se consulta no banco; aqui só entra assunto, decisão e pendência. É o que
 *     impede a deriva de virar erro em dinheiro.
 *  3. O resumo é visível e apagável pelo usuário (/app/perfil), o que quebra o
 *     ciclo fechado — ele é referência, nunca instrução nem fonte de duplicata.
 */

/** Teto do resumo guardado (~300 palavras). Cortar é melhor que deixar crescer. */
const TETO_RESUMO = 1500;
/** Mensagens do dia enviadas para resumir (as mais recentes). */
const MAX_MENSAGENS = 120;

const PROMPT_RESUMO = `Você resume a conversa de um dia entre uma família e a Nia (assistente financeira), para que a Nia não perca o contexto geral nos dias seguintes.

Recebe o RESUMO ACUMULADO dos dias anteriores e as MENSAGENS DE HOJE. Devolve UM resumo novo que substitui o anterior, cobrindo os dois.

REGRAS:
- No máximo 250 palavras. Texto corrido em português do Brasil, sem markdown, sem títulos, sem bullets.
- NUNCA escreva valores em dinheiro, quantidades ou preços, e NUNCA afirme que algo "foi lançado", "foi pago" ou "está registrado". Esses fatos vivem no banco de dados e são consultados por ferramenta — se entrarem aqui e estiverem errados, viram mentira permanente.
- Guarde o que NÃO está no banco: assuntos em andamento, decisões tomadas, combinados, preferências manifestadas, pendências ("ficou de conferir X"), contexto de vida (viagem, obra, tratamento, mudança de rotina).
- Date o que for datável ("desde meados de julho", "na semana do dia 20").
- Descarte o que já foi concluído e não tem mais efeito. O resumo deve encolher quando o assunto morre, não só crescer.
- Se um assunto do resumo anterior não apareceu mais e já se resolveu, tire.
- Escreva só o resumo, sem preâmbulo.`;

interface ContextoConversa {
  resumo?: string;
  resumido_em?: string;
  ate?: string;
}

/** Resumo rolante mais recente do workspace (o do último dia encerrado). */
export async function getResumoRolante(
  workspaceId: string,
): Promise<{ texto: string; ate: string } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("conversas_ia")
    .select("contexto")
    .eq("workspace_id", workspaceId)
    .eq("arquivada", true)
    .not("contexto->>resumo", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ctx = (data as { contexto: ContextoConversa } | null)?.contexto;
  if (!ctx?.resumo) return null;
  return { texto: ctx.resumo, ate: ctx.ate ?? "" };
}

async function gerarResumo(
  resumoAnterior: string | null,
  mensagens: { papel: string; conteudo: string }[],
): Promise<string | null> {
  const config = await getNiaConfig();
  const apiKey = await getApiKey(config.provedor);
  const provider = getProvider(config.provedor);
  if (!apiKey || !provider) return null;

  const transcricao = mensagens
    .map((m) => `${m.papel === "assistant" ? "Nia" : "Família"}: ${m.conteudo.slice(0, 1200)}`)
    .join("\n");
  const entrada = [
    resumoAnterior
      ? `RESUMO ACUMULADO ATÉ ONTEM:\n${resumoAnterior}`
      : "RESUMO ACUMULADO ATÉ ONTEM: (não há — este é o primeiro)",
    `MENSAGENS DE HOJE:\n${transcricao}`,
  ].join("\n\n");

  const res = await provider({
    apiKey,
    modelo: config.modelo,
    systemPrompt: PROMPT_RESUMO,
    temperature: 0.2,
    maxTokens: 1024,
    userMessage: entrada,
    tools: [],
    ctx: { workspaceId: "", profileId: "", conversaId: "" },
  });
  const texto = res.texto.trim();
  return texto ? texto.slice(0, TETO_RESUMO) : null;
}

/**
 * Encerra as conversas abertas de dias anteriores. A mais recente ganha o resumo
 * rolante; as demais (conversas velhas e soltas) são só arquivadas — resumi-las
 * custaria uma chamada por conversa para reconstruir contexto já superado.
 *
 * Roda no início do turno, então acontece UMA vez por dia. Nunca derruba o turno:
 * se o resumo falhar, a conversa é arquivada mesmo assim (perder a rotação é pior
 * que perder o resumo) e o erro vai para o log.
 */
export async function rotacionarConversas(workspaceId: string): Promise<void> {
  const aberta = await getConversaAberta(workspaceId);
  if (!aberta || aberta.ultimoDia === hojeISO()) return;

  const supabase = createClient();
  let resumo: string | null = null;
  try {
    const anterior = await getResumoRolante(workspaceId);
    const { data } = await supabase
      .from("mensagens_ia")
      .select("papel, conteudo")
      .eq("conversa_id", aberta.id)
      .in("papel", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(MAX_MENSAGENS);
    const msgs = ((data as { papel: string; conteudo: string | null }[] | null) ?? [])
      .reverse()
      .filter((m): m is { papel: string; conteudo: string } => Boolean(m.conteudo?.trim()));
    if (msgs.length > 0) resumo = await gerarResumo(anterior?.texto ?? null, msgs);
  } catch (e) {
    console.error("[nia/resumo] falha ao resumir a conversa do dia", e);
  }

  const patch: Record<string, unknown> = { arquivada: true, updated_at: new Date().toISOString() };
  if (resumo) {
    patch.contexto = { resumo, resumido_em: new Date().toISOString(), ate: aberta.ultimoDia };
    patch.titulo = `Conversa de ${formatDate(aberta.ultimoDia)}`;
  }
  await supabase.from("conversas_ia").update(patch).eq("id", aberta.id);

  // Conversas antigas que ficaram abertas por acaso: arquiva sem resumir. Seguro
  // porque só chegamos aqui quando nenhuma conversa aberta tem mensagem de hoje —
  // por isso esta função PRECISA rodar antes de getOrCreateConversa criar a nova.
  await supabase
    .from("conversas_ia")
    .update({ arquivada: true })
    .eq("workspace_id", workspaceId)
    .eq("arquivada", false);
}
